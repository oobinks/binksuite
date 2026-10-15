// The task engine. Tasks live in D1 and move through the state machine in
// src/shared/tasks.ts. `tick()` is called by the browser while the app is open
// and by the cron trigger every 5 minutes. Each tick is cheap: a handful of
// queries and no heavy CPU, so it fits the free plan's 10 ms budget.
import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import type { DB } from "../db";
import { activity, approvals, handoffs, ledger, products, tasks } from "../db/schema";
import { nextState, type TaskEvent, type TaskState } from "../../shared/tasks";
import { AGENT_BY_ID, ROOM_BY_ID, type AgentId, type RoomId } from "../../shared/registry";
import { isRoomUnlocked, XP, levelForXp } from "../../shared/game";
import { calculateFees } from "../../shared/fees";
import { hashString, intBetween, mulberry32, pick } from "../../shared/rng";
import type { Settings } from "../../shared/settings";
import { newId } from "../lib/crypto";
import { kvGet, kvSet, nowIso, sum, visible } from "../lib/store";
import { STEP_BY_KIND, FIRST_STEP } from "./agents";
import type { ProductRow, TaskRow } from "./agents/types";
import { DEMO_NICHES } from "./agents/demoContent";
import { awardXp, checkAchievements, notify, recordEvent, totalXp } from "./game";

export class EngineError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export async function logActivity(db: DB, agent: AgentId | null, room: RoomId | null, kind: string, message: string, demo: boolean) {
  await db.insert(activity).values({ agent, room, kind, message, demo, createdAt: nowIso() });
}

async function transition(db: DB, task: TaskRow, event: TaskEvent, patch: Partial<TaskRow> = {}): Promise<TaskState> {
  const to = nextState(task.state as TaskState, event, { attempts: task.attempts, maxAttempts: task.maxAttempts });
  // Optimistic concurrency: only move the task if nobody else already did.
  const res = await db
    .update(tasks)
    .set({ ...patch, state: to, updatedAt: nowIso() })
    .where(and(eq(tasks.id, task.id), eq(tasks.state, task.state)))
    .run();
  if (!res.meta.changes) throw new EngineError("That task just changed — refresh and try again.", 409);
  task.state = to;
  Object.assign(task, patch);
  return to;
}

export async function createTask(db: DB, product: ProductRow, kind: string, opts: { demo: boolean; input?: Record<string, unknown> }) {
  const step = STEP_BY_KIND[kind];
  if (!step) throw new EngineError(`Unknown step ${kind}`);
  const now = nowIso();
  const row = {
    id: newId("t_"),
    productId: product.id,
    room: step.room,
    agent: step.agent,
    kind,
    title: step.title(product),
    state: "queued",
    progress: 0,
    attempts: 0,
    maxAttempts: 3,
    needsApproval: step.needsApproval,
    input: opts.input ?? {},
    durationMs: 0,
    demo: opts.demo,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(tasks).values(row);
  await db.update(products).set({ stage: step.room, updatedAt: now }).where(eq(products.id, product.id));
  return row;
}

export async function spawnDemoProduct(db: DB, rng: () => number = Math.random): Promise<ProductRow> {
  const n = pick(rng, DEMO_NICHES);
  const now = nowIso();
  const product: ProductRow = {
    id: newId("p_"),
    title: n.product,
    niche: n.niche,
    stage: "research",
    seed: Math.floor(rng() * 1e6),
    pricePence: null,
    data: { niche: n.niche },
    demo: true,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(products).values(product);
  await createTask(db, product, FIRST_STEP, { demo: true });
  await logActivity(db, "scout", "research", "new", `New idea on the board: “${n.niche}”`, true);
  return product;
}

/** Today's and this month's API spend (pence, positive numbers). */
export async function apiSpend(db: DB, demoMode: boolean, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  const month = now.toISOString().slice(0, 7);
  const q = (from: string) =>
    db
      .select({ s: sum(ledger.amountPence) })
      .from(ledger)
      .where(and(eq(ledger.kind, "api"), gte(ledger.date, from), visible(ledger.demo, demoMode)))
      .get();
  const [d, m] = await Promise.all([q(day), q(month)]);
  return { todayPence: -(d?.s ?? 0), monthPence: -(m?.s ?? 0) };
}

function capHit(spend: { todayPence: number; monthPence: number }, s: Settings, extra: number) {
  if (spend.todayPence + extra > s.dailyCapPence) return `Daily spend cap (£${(s.dailyCapPence / 100).toFixed(2)}) reached`;
  if (spend.monthPence + extra > s.monthlyCapPence) return `Monthly spend cap (£${(s.monthlyCapPence / 100).toFixed(2)}) reached`;
  return null;
}

export interface TickResult {
  finished: number;
  claimed: number;
  spawned: number;
  sales: number;
}

/**
 * Advance the world. `interactive` = the owner has the app open; only then does
 * the demo simulator invent new products and sales (so the cron doesn't fill
 * the shop with fake data overnight).
 */
export async function tick(db: DB, settings: Settings, opts: { interactive: boolean; now?: Date }): Promise<TickResult> {
  const now = opts.now ?? new Date();
  const demoMode = settings.demoMode;
  const result: TickResult = { finished: 0, claimed: 0, spawned: 0, sales: 0 };
  const level = levelForXp(await totalXp(db, demoMode));

  const active = await db
    .select()
    .from(tasks)
    .where(and(inArray(tasks.state, ["queued", "working", "blocked"]), visible(tasks.demo, demoMode)))
    .orderBy(asc(tasks.createdAt))
    .all();

  // 1. Finish work whose time is up; update progress on the rest.
  for (const t of active.filter((t) => t.state === "working")) {
    const elapsed = now.getTime() - new Date(t.startedAt ?? now).getTime();
    if (elapsed >= t.durationMs) {
      await finishTask(db, t, settings, now);
      result.finished++;
    } else {
      const progress = Math.min(0.99, elapsed / Math.max(1, t.durationMs));
      await db.update(tasks).set({ progress }).where(and(eq(tasks.id, t.id), eq(tasks.state, "working"))).run();
    }
  }

  // 2. Each enabled agent picks up its oldest queued task, if it's free.
  const busy = new Set(active.filter((t) => t.state === "working" && t.agent).map((t) => t.agent));
  let spend = await apiSpend(db, demoMode, now);
  for (const t of active.filter((t) => t.state === "queued" || t.state === "blocked")) {
    const step = STEP_BY_KIND[t.kind];
    if (!step || !isRoomUnlocked(t.room as RoomId, level)) continue;
    if (t.agent && (busy.has(t.agent) || settings.agentsEnabled[t.agent] === false)) continue;
    const capMsg = capHit(spend, settings, step.estimatedCostPence);
    if (capMsg) {
      if (t.state === "queued") {
        await transition(db, t, "block", { error: capMsg });
        await logActivity(db, t.agent as AgentId, t.room as RoomId, "blocked", `⛔ ${capMsg}`, t.demo);
      }
      continue;
    }
    if (t.state === "blocked") await transition(db, t, "unblock", { error: null });
    const rng = mulberry32(hashString(t.id));
    const durationMs = intBetween(rng, step.durationMs[0], step.durationMs[1]);
    await transition(db, t, "claim", { startedAt: nowIso(now), durationMs, progress: 0, attempts: t.attempts + 1 });
    if (t.agent) {
      busy.add(t.agent);
      await logActivity(db, t.agent as AgentId, t.room as RoomId, "start", `Started: ${t.title}`, t.demo);
    }
    result.claimed++;
    if (durationMs === 0) {
      await finishTask(db, t, settings, now);
      result.finished++;
    }
    spend = { todayPence: spend.todayPence + step.estimatedCostPence, monthPence: spend.monthPence + step.estimatedCostPence };
  }

  // 3. Demo simulator: keep a few products flowing and the odd sale trickling in.
  if (demoMode && opts.interactive) {
    const clock = (await kvGet<{ lastSpawn: number; lastSale: number }>(db, "demoClock")) ?? { lastSpawn: 0, lastSale: now.getTime() };
    const inPipeline = await db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(products)
      .where(and(eq(products.demo, true), sql`${products.stage} != 'live'`))
      .get();
    if ((inPipeline?.n ?? 0) < 3 && now.getTime() - clock.lastSpawn > 90_000) {
      await spawnDemoProduct(db);
      clock.lastSpawn = now.getTime();
      result.spawned++;
    }
    if (now.getTime() - clock.lastSale > 150_000 && Math.random() < 0.5) {
      if (await demoSale(db, settings, now)) result.sales++;
      clock.lastSale = now.getTime();
    }
    await kvSet(db, "demoClock", clock);
  }
  return result;
}

async function getProduct(db: DB, id: string | null): Promise<ProductRow> {
  const p = id ? await db.select().from(products).where(eq(products.id, id)).get() : undefined;
  if (!p) throw new EngineError("Product not found", 404);
  return p;
}

async function finishTask(db: DB, t: TaskRow, settings: Settings, now: Date) {
  const step = STEP_BY_KIND[t.kind];
  const product = await getProduct(db, t.productId);
  try {
    const res = await step.run({ task: t, product, settings, rng: mulberry32(hashString(t.id) ^ product.seed) });
    if (res.productData || res.productTitle || res.pricePence) {
      await db
        .update(products)
        .set({
          data: { ...product.data, ...(res.productData ?? {}) },
          title: res.productTitle ?? product.title,
          pricePence: res.pricePence ?? product.pricePence,
          updatedAt: nowIso(now),
        })
        .where(eq(products.id, product.id));
    }
    if (res.costPence) {
      await db.insert(ledger).values({
        id: newId("l_"),
        date: nowIso(now),
        kind: "api",
        category: t.agent ? `${AGENT_BY_ID[t.agent as AgentId].name} (demo AI)` : "API",
        description: t.title,
        amountPence: -res.costPence,
        productId: product.id,
        demo: t.demo,
        createdAt: nowIso(now),
      });
    }
    const event: TaskEvent = step.needsApproval ? "finish" : "finish_auto";
    await transition(db, t, event, { output: res.output, progress: 1, finishedAt: nowIso(now), error: null });
    await logActivity(db, t.agent as AgentId | null, t.room as RoomId, "finish", res.log, t.demo);
    if (step.needsApproval) {
      await db.insert(approvals).values({
        id: newId("a_"),
        taskId: t.id,
        kind: step.approvalKind,
        summary: t.title,
        status: "pending",
        demo: t.demo,
        createdAt: nowIso(now),
      });
    } else {
      await handOff(db, t, product, now);
    }
  } catch (e) {
    if (e instanceof EngineError && e.status === 409) return;
    const msg = e instanceof Error ? e.message : String(e);
    const to = await transition(db, t, "error", { error: msg, progress: 0 });
    await logActivity(db, t.agent as AgentId | null, t.room as RoomId, "error", `${to === "failed" ? "Gave up" : "Will retry"}: ${msg}`, t.demo);
  }
}

/** Create the next step's task and send the parcel on its way. */
async function handOff(db: DB, t: TaskRow, product: ProductRow, now: Date, kindOverride?: string, input?: Record<string, unknown>) {
  const step = STEP_BY_KIND[t.kind];
  const nextKind = kindOverride ?? step.next;
  if (!nextKind) {
    await db.update(products).set({ stage: "live", updatedAt: nowIso(now) }).where(eq(products.id, product.id));
    return;
  }
  const nextStep = STEP_BY_KIND[nextKind];
  const fresh = await getProduct(db, product.id);
  await createTask(db, fresh, nextKind, { demo: t.demo, input });
  if (nextStep.room !== t.room) {
    await db.insert(handoffs).values({ productId: product.id, fromRoom: t.room, toRoom: nextStep.room, demo: t.demo, createdAt: nowIso(now) });
    await logActivity(db, t.agent as AgentId | null, t.room as RoomId, "handoff", `📦 Sent “${fresh.title}” to ${ROOM_BY_ID[nextStep.room].name}`, t.demo);
  }
}

async function getTask(db: DB, id: string): Promise<TaskRow> {
  const t = await db.select().from(tasks).where(eq(tasks.id, id)).get();
  if (!t) throw new EngineError("Task not found", 404);
  return t;
}

async function decideApproval(db: DB, taskId: string, status: "approved" | "rejected" | "discarded", note?: string) {
  await db
    .update(approvals)
    .set({ status, note: note ?? null, decidedAt: nowIso() })
    .where(and(eq(approvals.taskId, taskId), eq(approvals.status, "pending")));
}

export async function approveTask(db: DB, id: string, settings: Settings, note?: string) {
  const t = await getTask(db, id);
  const step = STEP_BY_KIND[t.kind];
  if (t.state !== "needs_approval") throw new EngineError("That task isn't waiting for approval.");
  const level = levelForXp(await totalXp(db, settings.demoMode));
  if (!isRoomUnlocked(t.room as RoomId, level)) throw new EngineError(`${ROOM_BY_ID[t.room as RoomId].name} is still locked.`);
  const refusal = step.canApprove?.(t, note);
  if (refusal) throw new EngineError(refusal);
  const product = await getProduct(db, t.productId);
  const now = new Date();
  await transition(db, t, "approve", { note: note ?? null });
  await decideApproval(db, t.id, "approved", note);
  await logActivity(db, t.agent as AgentId | null, t.room as RoomId, "approved", `You approved: ${t.title}${note ? ` (note: ${note})` : ""}`, t.demo);
  await recordEvent(db, "task_approved", t.demo);
  await awardXp(db, XP.approveTask, `Approved: ${t.title}`, t.demo, settings.demoMode);
  if (!step.next) {
    await recordEvent(db, "product_launched", t.demo);
    await awardXp(db, XP.launchProduct, `Launched: ${product.title}`, t.demo, settings.demoMode);
    await notify(db, "launch", `🚀 ${product.title} is live!`, "Nice work — it's on the shelf.", t.demo);
  }
  await handOff(db, t, product, now);
  await checkAchievements(db, t.demo, settings.demoMode);
  return getTask(db, id);
}

export async function rejectTask(db: DB, id: string, note: string) {
  const t = await getTask(db, id);
  const step = STEP_BY_KIND[t.kind];
  if (t.state !== "needs_approval") throw new EngineError("That task isn't waiting for approval.");
  await decideApproval(db, t.id, "rejected", note);
  if (step.rejectTo) {
    await transition(db, t, "send_back", { note });
    const product = await getProduct(db, t.productId);
    await handOff(db, t, product, new Date(), step.rejectTo, { fix: true, note });
    await logActivity(db, t.agent as AgentId | null, t.room as RoomId, "rejected", `Sent back to ${ROOM_BY_ID[STEP_BY_KIND[step.rejectTo].room].name}: ${note}`, t.demo);
  } else {
    await transition(db, t, "reject", { note, progress: 0, attempts: 0, output: null });
    await logActivity(db, t.agent as AgentId | null, t.room as RoomId, "rejected", `Redo requested: ${note || "no note"}`, t.demo);
  }
  return getTask(db, id);
}

export async function retryTask(db: DB, id: string) {
  const t = await getTask(db, id);
  await transition(db, t, "retry", { attempts: 0, error: null, progress: 0 });
  return getTask(db, id);
}

/** A pretend Etsy sale for a live demo product: sale + fees in the ledger, XP, celebration. */
export async function demoSale(db: DB, settings: Settings, now = new Date()): Promise<boolean> {
  const live = await db.select().from(products).where(and(eq(products.demo, true), eq(products.stage, "live"))).all();
  if (!live.length) return false;
  const p = pick(Math.random, live);
  const price = p.pricePence ?? 399;
  await recordSale(db, settings, { pricePence: price, description: p.title, productId: p.id, demo: true, date: nowIso(now) });
  return true;
}

export async function recordSale(
  db: DB,
  settings: Settings,
  s: { pricePence: number; description: string; productId?: string | null; demo: boolean; date: string; nonGbp?: boolean; offsiteAds?: boolean },
) {
  const fees = calculateFees({ pricePence: s.pricePence, nonGbp: s.nonGbp, offsiteAds: s.offsiteAds }, settings.fees);
  const saleId = newId("l_");
  await db.insert(ledger).values([
    { id: saleId, date: s.date, kind: "sale", category: "Etsy sale", description: s.description, amountPence: fees.grossPence, nonGbp: !!s.nonGbp, productId: s.productId ?? null, demo: s.demo, createdAt: nowIso() },
    {
      id: newId("l_"),
      date: s.date,
      kind: "fee",
      category: "Etsy fees (inc. VAT)",
      description: `Fees on: ${s.description}`,
      amountPence: -fees.totalFeesPence,
      productId: s.productId ?? null,
      saleId,
      demo: s.demo,
      createdAt: nowIso(),
    },
  ]);
  await recordEvent(db, "sale", s.demo);
  await awardXp(db, XP.sale, `Sale: ${s.description}`, s.demo, settings.demoMode);
  await notify(db, "sale", `🪙 Sale! +£${(fees.netPence / 100).toFixed(2)}`, s.description, s.demo);
  await checkAchievements(db, s.demo, settings.demoMode);
  return { saleId, fees };
}
