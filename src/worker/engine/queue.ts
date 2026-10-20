// The task engine. Tasks live in D1 and move through the state machine in
// src/shared/tasks.ts. `tick()` is called by the browser while the app is open
// and by the cron trigger every 5 minutes. Each tick is cheap: a handful of
// queries and no heavy CPU, so it fits the free plan's 10 ms budget.
import type { EtsyClient } from "../providers/etsy";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { DB } from "../db";
import { activity, approvals, claudeJobs, handoffs, ledger, products, tasks, trendNiches } from "../db/schema";
import { nextState, type TaskEvent, type TaskState } from "../../shared/tasks";
import { AGENT_BY_ID, ROOM_BY_ID, type AgentId, type RoomId } from "../../shared/registry";
import { XP } from "../../shared/game";
import { calculateFees } from "../../shared/fees";
import { hashString, intBetween, mulberry32, pick } from "../../shared/rng";
import type { Settings } from "../../shared/settings";
import { newId } from "../lib/crypto";
import { invalidateStats, kvGet, kvSet, nowIso, sum, visible } from "../lib/store";
import { STEP_BY_KIND, FIRST_STEP, stepNeedsApproval } from "./agents";
import { formatOf, guessFormat, pickFormat, type ProductFormat } from "../../shared/format";
import type { PartialResult, ProductRow, StepDef, StepResult, TaskRow } from "./agents/types";
import { AiLimitError, aiUsageToday, isAiLimit, MAX_CALL_NEURONS, type AiServices } from "../providers/ai";
import { DEMO_NICHES } from "./agents/demoContent";
import { CLAUDE_WAITING, isClaudePending } from "../providers/claudeCode";
import { awardXp, checkAchievements, notify, recordEvent } from "./game";
import { queuePush } from "./push";

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
    needsApproval: stepNeedsApproval(step, product),
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

/** You suggest an idea; Scout researches it next (suggestions jump the queue). */
export async function suggestIdea(
  db: DB,
  settings: Settings,
  idea: string,
  notes?: string,
  realAi = false,
  extra: { market?: Record<string, unknown> | null; trendKeyword?: string; origin?: "you" | "daily" | "radar"; format?: ProductFormat } = {},
): Promise<ProductRow> {
  const now = nowIso();
  const clean = idea.trim().replace(/\s+/g, " ");
  const demo = !realAi && settings.demoMode;
  const product: ProductRow = {
    id: newId("p_"),
    title: clean,
    niche: clean,
    stage: "research",
    seed: Math.floor(Math.random() * 1e6),
    pricePence: null,
    data: {
      suggestion: { idea: clean, notes: notes?.trim() || undefined, origin: extra.origin ?? "you" },
      ...(extra.market ? { market: extra.market } : {}),
      ...(extra.trendKeyword ? { trendKeyword: extra.trendKeyword } : {}),
      // 🎨 ART / 📊 EXCEL / 📄 PDF: what you picked, or a guess from the idea. Demo products are always art.
      // (Only kinds switched on in Settings → Products we make.)
      format: demo ? "art" : pickFormat(extra.format ?? guessFormat(clean), settings.formats),
    },
    // With real AI your idea is a real product. Without it, in demo mode, it's simulated.
    demo,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(products).values(product);
  await createTask(db, product, FIRST_STEP, { demo: product.demo, input: { suggestion: true } });
  if ((extra.origin ?? "you") === "you") await logActivity(db, "scout", "research", "new", `💡 You suggested “${clean}”. Scout is on it!`, product.demo);
  return product;
}

/** Your suggestions, newest first, with Scout's verdict once it's in. */
export async function listSuggestions(db: DB, demoMode: boolean) {
  const rows = await db
    .select()
    .from(products)
    .where(and(sql`json_extract(${products.data}, '$.suggestion') IS NOT NULL`, visible(products.demo, demoMode)))
    .orderBy(desc(products.createdAt))
    .limit(20)
    .all();
  // Dropped ideas leave the list (they can still come back as a new suggestion).
  return rows.filter((p) => !(p.data as { dropped?: boolean }).dropped && p.stage !== "dropped").map((p) => {
    const d = p.data as { suggestion: { idea: string; notes?: string; origin?: string }; report?: { verdict: string; overall: number }; dropped?: boolean };
    return {
      productId: p.id,
      format: formatOf(p),
      idea: d.suggestion.idea,
      notes: d.suggestion.notes ?? null,
      origin: d.suggestion.origin ?? "you",
      stage: d.dropped ? "dropped" : p.stage,
      verdict: d.report?.verdict ?? null,
      overall: d.report?.overall ?? null,
      createdAt: p.createdAt,
    };
  });
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
export interface TickOptions {
  /** The owner has the app open (the demo simulator only runs then). */
  interactive: boolean;
  now?: Date;
  /** Real AI + file storage. Without them, real products wait (⛔). */
  ai?: AiServices | null;
  files?: R2Bucket | null;
  /** Live Etsy search for steps that use it (keyword research). */
  etsy?: () => Promise<EtsyClient | null>;
  /** Run slow AI jobs after the response is sent (ctx.waitUntil). Omit to wait for them. */
  defer?: (job: Promise<unknown>) => void;
}

/** Real (non-demo) products use the real version of a step when there is one. */
const isReal = (t: TaskRow, step: StepDef) => !t.demo && !!step.real;
const LEASE_MS = 90_000;

async function aiBlockReason(db: DB, settings: Settings, opts: TickOptions): Promise<string | null> {
  if (!settings.ai.enabled) return "Real AI is switched off. Turn it on in Settings → AI engine.";
  if (!opts.ai || !opts.files) return "Real AI isn't available on this server.";
  // Claude Code runs on your subscription: there's no daily neuron allowance to check.
  if (settings.ai.provider === "claude-code") return null;
  const used = await aiUsageToday(db);
  // Keep headroom for a whole call so a job never starts only to be refused mid-way.
  if (used.neurons + MAX_CALL_NEURONS > settings.ai.dailyNeuronCap) return new AiLimitError().message;
  return null;
}

export async function tick(db: DB, settings: Settings, opts: TickOptions): Promise<TickResult> {
  const now = opts.now ?? new Date();
  const demoMode = settings.demoMode;
  const result: TickResult = { finished: 0, claimed: 0, spawned: 0, sales: 0 };

  const active = await db
    .select()
    .from(tasks)
    .where(and(inArray(tasks.state, ["queued", "working", "blocked"]), visible(tasks.demo, demoMode)))
    .orderBy(asc(tasks.createdAt))
    .all();

  // 1. Finish work whose time is up. (Progress is worked out from the start time
  //    when it's read, so ticking doesn't cost a database write per task.)
  for (const t of active.filter((t) => t.state === "working")) {
    const step = STEP_BY_KIND[t.kind];
    if (step && isReal(t, step)) {
      // Real AI job: take a short lease so two open tabs never run it twice.
      if (!opts.ai || !opts.files || !settings.ai.enabled) continue;
      if (!(await takeLease(db, t, now))) continue;
      const job = runReal(db, t, settings, { ai: opts.ai, files: opts.files, etsy: opts.etsy }, now);
      if (opts.defer) opts.defer(job);
      else await job;
      continue;
    }
    if (now.getTime() - new Date(t.startedAt ?? now).getTime() >= t.durationMs) {
      await finishTask(db, t, settings, now);
      result.finished++;
    }
  }

  // 2. Each enabled agent picks up its oldest queued task, if it's free.
  const busy = new Set(active.filter((t) => t.state === "working" && t.agent).map((t) => t.agent));
  let spend = await apiSpend(db, demoMode, now);
  // Your own suggestions jump the queue.
  // Tasks waiting on Claude stay put until their answer arrives (no point re-running them every tick).
  const blockedIds = active.filter((t) => t.state === "blocked").map((t) => t.id);
  const onClaude = new Set(
    blockedIds.length
      ? (
          await db
            .select({ taskId: claudeJobs.taskId })
            .from(claudeJobs)
            .where(and(inArray(claudeJobs.taskId, blockedIds), inArray(claudeJobs.status, ["waiting", "working"])))
            .all()
        ).map((r) => r.taskId)
      : [],
  );
  const waiting = active
    .filter((t) => t.state === "queued" || (t.state === "blocked" && !onClaude.has(t.id)))
    .sort((a, b) => Number(!!(b.input as { suggestion?: boolean }).suggestion) - Number(!!(a.input as { suggestion?: boolean }).suggestion));
  for (const t of waiting) {
    const step = STEP_BY_KIND[t.kind];
    if (!step) continue;
    if (t.agent && (busy.has(t.agent) || settings.agentsEnabled[t.agent] === false)) continue;
    const capMsg = isReal(t, step) ? await aiBlockReason(db, settings, opts) : capHit(spend, settings, step.estimatedCostPence);
    if (capMsg) {
      if (t.state === "queued") {
        await transition(db, t, "block", { error: capMsg });
        await logActivity(db, t.agent as AgentId, t.room as RoomId, "blocked", `⛔ ${capMsg}`, t.demo);
      }
      continue;
    }
    if (t.state === "blocked") await transition(db, t, "unblock", { error: null });
    const rng = mulberry32(hashString(t.id));
    const durationMs = isReal(t, step) ? (step.realSeconds ?? 10) * 1000 : intBetween(rng, step.durationMs[0], step.durationMs[1]);
    await transition(db, t, "claim", { startedAt: nowIso(now), durationMs, progress: 0, attempts: t.attempts + 1 });
    if (t.agent) {
      busy.add(t.agent);
      await logActivity(db, t.agent as AgentId, t.room as RoomId, "start", `Started: ${t.title}`, t.demo);
    }
    result.claimed++;
    if (durationMs === 0 && !isReal(t, step)) {
      await finishTask(db, t, settings, now);
      result.finished++;
    }
    spend = { todayPence: spend.todayPence + step.estimatedCostPence, monthPence: spend.monthPence + step.estimatedCostPence };
  }

  // 3. Demo simulator: the odd pretend sale trickling in. It never adds ideas to the
  // task board by itself: only ideas you send (Today's ideas, Trending now, the
  // Suggestion box) go on the board.
  if (demoMode && opts.interactive) {
    const clock = (await kvGet<{ lastSpawn: number; lastSale: number }>(db, "demoClock")) ?? { lastSpawn: 0, lastSale: now.getTime() };
    const before = JSON.stringify(clock);
    if (now.getTime() - clock.lastSale > 150_000 && Math.random() < 0.5) {
      if (await demoSale(db, settings, now)) result.sales++;
      clock.lastSale = now.getTime();
    }
    if (JSON.stringify(clock) !== before) await kvSet(db, "demoClock", clock);
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
    await applyResult(db, t, product, res, now);
  } catch (e) {
    await failTask(db, t, e);
  }
}

async function takeLease(db: DB, t: TaskRow, now: Date): Promise<boolean> {
  const res = await db
    .update(tasks)
    .set({ leaseUntil: new Date(now.getTime() + LEASE_MS).toISOString() })
    .where(and(eq(tasks.id, t.id), eq(tasks.state, "working"), sql`(${tasks.leaseUntil} IS NULL OR ${tasks.leaseUntil} < ${nowIso(now)})`))
    .run();
  return res.meta.changes > 0;
}

/** Run one slice of a real AI job. Long jobs (like 4 images) report progress and continue next tick. */
export async function runReal(db: DB, t: TaskRow, settings: Settings, svc: { ai: AiServices; files: R2Bucket; etsy?: () => Promise<EtsyClient | null> }, now = new Date()) {
  const step = STEP_BY_KIND[t.kind];
  try {
    const product = await getProduct(db, t.productId);
    const ai = svc.ai.forTask?.({ id: t.id, productId: t.productId, title: t.title }) ?? svc.ai;
    const res = await step.real!({ task: t, product, settings, rng: mulberry32(hashString(t.id) ^ product.seed), ai, files: svc.files, etsy: svc.etsy });
    if ("partial" in res) {
      const p = res as PartialResult;
      await db
        .update(tasks)
        .set({ output: p.partial, progress: p.progress, leaseUntil: null, updatedAt: nowIso() })
        .where(and(eq(tasks.id, t.id), eq(tasks.state, "working")));
      if (p.log) await logActivity(db, t.agent as AgentId | null, t.room as RoomId, "progress", p.log, t.demo);
      return;
    }
    t.leaseUntil = null;
    await applyResult(db, t, product, res as StepResult, now, { leaseUntil: null });
  } catch (e) {
    if (isClaudePending(e)) {
      // Saved to Claude's to-do list; the task waits until a Claude session answers.
      await transition(db, t, "block", { error: CLAUDE_WAITING, leaseUntil: null }).catch(() => {});
      await logActivity(db, t.agent as AgentId | null, t.room as RoomId, "blocked", `✨ Added to Claude's to-do list: ${t.title}`, t.demo);
      return;
    }
    if (isAiLimit(e)) {
      const msg = new AiLimitError().message;
      await transition(db, t, "block", { error: msg, leaseUntil: null }).catch(() => {});
      await logActivity(db, t.agent as AgentId | null, t.room as RoomId, "blocked", `⛔ ${msg}`, t.demo);
      return;
    }
    await failTask(db, t, e, { leaseUntil: null });
  }
}

async function failTask(db: DB, t: TaskRow, e: unknown, patch: Partial<TaskRow> = {}) {
  if (e instanceof EngineError && e.status === 409) return;
  const msg = e instanceof Error ? e.message : String(e);
  try {
    const to = await transition(db, t, "error", { ...patch, error: msg, progress: 0 });
    await logActivity(db, t.agent as AgentId | null, t.room as RoomId, "error", `${to === "failed" ? "Gave up" : "Will retry"}: ${msg}`, t.demo);
  } catch {
    /* task moved on meanwhile */
  }
}

async function applyResult(db: DB, t: TaskRow, product: ProductRow, res: StepResult, now: Date, patch: Partial<TaskRow> = {}) {
  const step = STEP_BY_KIND[t.kind];
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
      category: t.agent ? `${AGENT_BY_ID[t.agent as AgentId].name} (${t.demo ? "demo AI" : "AI"})` : "API",
      description: t.title,
      amountPence: -res.costPence,
      productId: product.id,
      demo: t.demo,
      createdAt: nowIso(now),
    });
    await invalidateStats(db);
  }
  const event: TaskEvent = t.needsApproval ? "finish" : "finish_auto";
  await transition(db, t, event, { ...patch, output: res.output, progress: 1, finishedAt: nowIso(now), error: null });
  await logActivity(db, t.agent as AgentId | null, t.room as RoomId, "finish", res.log, t.demo);
  if (t.needsApproval) {
    if (!t.demo) await queuePush(db, "approvals", { title: "Waiting for you", body: t.title, url: `/room/${t.room}`, tag: "approvals" });
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
}

/** Create the next step's task and send the parcel on its way. */
async function handOff(db: DB, t: TaskRow, product: ProductRow, now: Date, kindOverride?: string, input?: Record<string, unknown>) {
  const step = STEP_BY_KIND[t.kind];
  const nextKind = kindOverride ?? (step.nextFor ? step.nextFor(product) : step.next);
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

export async function approveTask(db: DB, id: string, settings: Settings, note?: string, data?: Record<string, unknown>) {
  const t = await getTask(db, id);
  const step = STEP_BY_KIND[t.kind];
  if (t.state !== "needs_approval") throw new EngineError("That task isn't waiting for approval.");
  const refusal = step.canApprove?.(t, note);
  if (refusal) throw new EngineError(refusal);
  if (step.standalone) return approveStandalone(db, t, step, settings, note, data);
  const product = await getProduct(db, t.productId);
  const decision = step.onApprove?.(t, product, data);
  if (decision?.error) throw new EngineError(decision.error);
  const now = new Date();
  await transition(db, t, "approve", { note: note ?? null });
  if ((decision?.productData && Object.keys(decision.productData).length) || decision?.pricePence) {
    await db
      .update(products)
      .set({ data: { ...product.data, ...(decision.productData ?? {}) }, pricePence: decision.pricePence ?? product.pricePence, updatedAt: nowIso(now) })
      .where(eq(products.id, product.id));
  }
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

/** Alerts like Price Watch: approving closes them (and records your new price if you gave one). */
async function approveStandalone(db: DB, t: TaskRow, step: StepDef, settings: Settings, note?: string, data?: Record<string, unknown>) {
  const product = t.productId ? await db.select().from(products).where(eq(products.id, t.productId)).get() : undefined;
  const decision = product ? step.onApprove?.(t, product, data) : step.onApprove?.(t, { data: {} } as ProductRow, data);
  if (decision?.error) throw new EngineError(decision.error);
  await transition(db, t, "approve", { note: note ?? null });
  await decideApproval(db, t.id, "approved", note);
  if (product && decision?.pricePence) {
    await db.update(products).set({ pricePence: decision.pricePence, updatedAt: nowIso() }).where(eq(products.id, product.id));
  }
  await logActivity(db, t.agent as AgentId | null, t.room as RoomId, "approved", `You sorted: ${t.title}${decision?.pricePence ? ` (now £${(decision.pricePence / 100).toFixed(2)})` : ""}`, t.demo);
  await recordEvent(db, "task_approved", t.demo);
  await awardXp(db, XP.approveTask, `Sorted: ${t.title}`, t.demo, settings.demoMode);
  return getTask(db, t.id);
}

export async function rejectTask(db: DB, id: string, note: string) {
  const t = await getTask(db, id);
  const step = STEP_BY_KIND[t.kind];
  if (t.state !== "needs_approval") throw new EngineError("That task isn't waiting for approval.");
  if (step.standalone) return dropTask(db, id, note || "Ignored");
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

/** Drop an idea (or any waiting task): the task fails and the product leaves the pipeline. */
export async function dropTask(db: DB, id: string, note?: string) {
  const t = await getTask(db, id);
  if (t.state !== "needs_approval" && t.state !== "queued" && t.state !== "blocked") throw new EngineError("Only waiting tasks can be dropped.");
  await transition(db, t, "discard", { note: note ?? "Dropped" });
  await db.update(approvals).set({ status: "discarded", note: note ?? null, decidedAt: nowIso() }).where(and(eq(approvals.taskId, t.id), eq(approvals.status, "pending")));
  if (t.productId) {
    const p = await getProduct(db, t.productId);
    await db.update(products).set({ stage: "dropped", data: { ...p.data, dropped: true }, updatedAt: nowIso() }).where(eq(products.id, p.id));
    await forgetDroppedIdea(db, p);
  }
  await logActivity(db, t.agent as AgentId | null, t.room as RoomId, "rejected", `🗑️ Dropped: ${t.title}${note ? ` (${note})` : ""}`, t.demo);
  return getTask(db, id);
}

/**
 * Dropping only removes an idea for now. Its niche can be suggested again (no
 * "recently suggested" cooldown), and if it was one of today's ideas it goes back
 * on today's list, ready to send again or to pick something else instead.
 */
async function forgetDroppedIdea(db: DB, p: ProductRow) {
  const keyword = (p.data as { trendKeyword?: string }).trendKeyword;
  if (keyword) await db.update(trendNiches).set({ lastSuggested: null }).where(eq(trendNiches.keyword, keyword));
  const key = `daily:${new Date().toISOString().slice(0, 10)}`;
  const daily = await kvGet<{ pickedId?: string; items: { id: string; productId?: string }[] }>(db, key);
  const item = daily?.items.find((i) => i.productId === p.id);
  if (!daily || !item) return;
  delete item.productId;
  if (daily.pickedId === item.id) {
    const other = daily.items.find((i) => i.productId);
    if (other) daily.pickedId = other.id;
    else delete daily.pickedId;
  }
  await kvSet(db, key, daily);
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
  await notify(db, "sale", `💰 Sale! +£${(fees.netPence / 100).toFixed(2)}`, s.description, s.demo);
  await checkAchievements(db, s.demo, settings.demoMode);
  return { saleId, fees };
}
