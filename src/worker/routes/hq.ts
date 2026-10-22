// The HQ: state snapshot (polled), rooms, agents, tasks, events, briefing.
import { and, desc, eq, inArray, or, gte } from "drizzle-orm";
import { z } from "zod";
import { newApp, body, HttpError, aiFor } from "../app";
import { brainstormIdeas } from "../engine/agents/real";
import { DEMO_NICHES } from "../engine/agents/demoContent";
import { isAiLimit } from "../providers/ai";
import { isClaudePending } from "../providers/claudeCode";
import { activity, products, tasks } from "../db/schema";
import { secretsStatus } from "../env";
import { kvGet, kvSet, visible } from "../lib/store";
import { radarTick } from "../engine/trends";
import { priceWatchTick } from "../engine/priceWatch";
import { etsyFor } from "./radar";
import { FORMATS, formatOf } from "../../shared/format";
import { tick, approveTask, rejectTask, retryTask, reopenTask, dropTask, suggestIdea, listSuggestions, EngineError } from "../engine/queue";
import { buildBriefing, buildSnapshot } from "../engine/snapshot";
import { recordEvent, checkAchievements } from "../engine/game";
import { AGENT_BY_ID, ROOM_BY_ID, type AgentId, type RoomId } from "../../shared/registry";
import type { CompetitorPrice } from "../../shared/pricing";
import type { ActivityView, TaskView } from "../../shared/api";
import type { DB } from "../db";
import { designStyleFor, setDesignStyle } from "../engine/designStyle";
import { STYLE_IDS } from "../../shared/designStyles";

const TASK_HISTORY_MS = 3 * 86_400_000;

async function taskViews(db: DB, where: Parameters<typeof and>[number], demoMode: boolean): Promise<TaskView[]> {
  const cutoff = new Date(Date.now() - TASK_HISTORY_MS).toISOString();
  const rows = await db
    .select({ t: tasks, productTitle: products.title, productNiche: products.niche, productData: products.data, productDemo: products.demo })
    .from(tasks)
    .leftJoin(products, eq(products.id, tasks.productId))
    .where(
      and(
        where,
        visible(tasks.demo, demoMode),
        or(inArray(tasks.state, ["queued", "working", "needs_approval", "blocked", "failed"]), gte(tasks.updatedAt, cutoff)),
      ),
    )
    .orderBy(desc(tasks.updatedAt))
    .limit(60)
    .all();
  const now = Date.now();
  return rows.map(({ t, productTitle, productNiche, productData, productDemo }) => ({
    id: t.id,
    productId: t.productId,
    productTitle: productTitle ?? "",
    productFormat: formatOf({ demo: productDemo ?? t.demo, niche: productNiche ?? "", data: productData }),
    room: t.room as RoomId,
    agent: t.agent as AgentId | null,
    kind: t.kind,
    title: t.title,
    state: t.state as TaskView["state"],
    progress: t.state === "working" && t.startedAt ? Math.min(0.99, (now - new Date(t.startedAt).getTime()) / Math.max(1, t.durationMs)) : t.progress,
    output: t.output ?? null,
    note: t.note,
    error: t.error,
    demo: t.demo,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  }));
}

async function activityViews(db: DB, where: Parameters<typeof and>[number], demoMode: boolean, limit = 40): Promise<ActivityView[]> {
  const rows = await db
    .select()
    .from(activity)
    .where(and(where, visible(activity.demo, demoMode)))
    .orderBy(desc(activity.id))
    .limit(limit)
    .all();
  return rows.map((r) => ({ ...r, agent: r.agent as AgentId | null, room: r.room as RoomId | null }));
}

function engineErrors<T>(p: Promise<T>): Promise<T> {
  return p.catch((e) => {
    if (e instanceof EngineError) throw new HttpError(e.status, e.message);
    throw e;
  });
}

export const hqRoutes = newApp()
  .get("/state", async (c) => {
    const db = c.get("db");
    const settings = c.get("settings");
    // The open app drives the engine; the cron covers the rest.
    await tick(db, settings, {
      interactive: true,
      ai: aiFor(c),
      files: c.env.FILES,
      etsy: () => etsyFor(c),
      // Slow AI jobs finish after this response is sent, so the map never waits on them.
      defer: (job) => c.executionCtx.waitUntil(job),
    });
    // While you're watching, keep the radar ticking every few minutes in the background.
    const lastRadar = (await kvGet<number>(db, "radarLastRun")) ?? 0;
    if (Date.now() - lastRadar > 4 * 60_000) {
      await kvSet(db, "radarLastRun", Date.now());
      const etsy = await etsyFor(c);
      c.executionCtx.waitUntil(
        radarTick(db, settings, { etsy, ai: aiFor(c), budget: 4 })
          .then(() => priceWatchTick(db, settings, etsy, new Date(), 4))
          .catch((e) => console.error("radar", e)),
      );
    }
    const snap = await buildSnapshot(db, settings, {
      afterNotification: Number(c.req.query("n") ?? 0) || 0,
      afterHandoff: Number(c.req.query("h") ?? 0) || 0,
      secrets: secretsStatus(c.env),
      aiReady: !!aiFor(c),
    });
    return c.json(snap);
  })
  .get("/rooms/:id", async (c) => {
    const id = c.req.param("id") as RoomId;
    if (!ROOM_BY_ID[id]) throw new HttpError(404, "No such room");
    const db = c.get("db");
    const demoMode = c.get("settings").demoMode;
    const [t, a] = await Promise.all([taskViews(db, eq(tasks.room, id), demoMode), activityViews(db, eq(activity.room, id), demoMode)]);
    return c.json({ tasks: t, activity: a });
  })
  .get("/agents/:id", async (c) => {
    const id = c.req.param("id") as AgentId;
    if (!AGENT_BY_ID[id]) throw new HttpError(404, "No such agent");
    const db = c.get("db");
    const demoMode = c.get("settings").demoMode;
    const [t, a] = await Promise.all([taskViews(db, eq(tasks.agent, id), demoMode), activityViews(db, eq(activity.agent, id), demoMode, 60)]);
    return c.json({ tasks: t, activity: a });
  })
  .get("/approvals", async (c) => {
    const db = c.get("db");
    return c.json({ tasks: await taskViews(db, eq(tasks.state, "needs_approval"), c.get("settings").demoMode) });
  })
  .post("/tasks/:id/approve", async (c) => {
    const b = await body(c, z.object({ note: z.string().max(500).optional(), data: z.record(z.string(), z.unknown()).optional() }));
    const t = await engineErrors(approveTask(c.get("db"), c.req.param("id"), c.get("settings"), b.note, b.data));
    return c.json({ ok: true, state: t.state });
  })
  .post("/tasks/:id/reject", async (c) => {
    const b = await body(c, z.object({ note: z.string().max(500).default("") }));
    const t = await engineErrors(rejectTask(c.get("db"), c.req.param("id"), b.note));
    return c.json({ ok: true, state: t.state });
  })
  .post("/tasks/:id/drop", async (c) => {
    const b = await body(c, z.object({ note: z.string().max(500).optional() }));
    const t = await engineErrors(dropTask(c.get("db"), c.req.param("id"), b.note));
    return c.json({ ok: true, state: t.state });
  })
  .get("/research/suggestions", async (c) => c.json({ suggestions: await listSuggestions(c.get("db"), c.get("settings").demoMode) }))
  .post("/research/suggestions", async (c) => {
    const b = await body(
      c,
      z.object({
        idea: z.string().trim().min(3, "Tell Scout a bit more (3+ characters)").max(120),
        notes: z.string().max(1000).optional(),
        format: z.enum(FORMATS).optional(),
      }),
    );
    const p = await suggestIdea(c.get("db"), c.get("settings"), b.idea, b.notes, !!aiFor(c), { format: b.format });
    return c.json({ ok: true, productId: p.id, real: !p.demo });
  })
  .post("/research/ideas", async (c) => {
    // ✨ "Suggest ideas for me": Scout brainstorms 5 niches you can send for research.
    const b = await body(c, z.object({ theme: z.string().max(120).optional() }));
    const ai = aiFor(c);
    const recent = (await listSuggestions(c.get("db"), true)).map((s) => s.idea);
    if (!ai) {
      const picks = DEMO_NICHES.filter((n) => !recent.includes(n.niche)).slice(0, 5);
      return c.json({ real: false, ideas: picks.map((n) => ({ idea: n.niche, why: n.audience })) });
    }
    try {
      return c.json({ real: true, ideas: await brainstormIdeas(ai, b.theme?.trim() || undefined, recent) });
    } catch (e) {
      if (isClaudePending(e)) return c.json({ real: true, pending: true, ideas: [] }, 202);
      throw new HttpError(isAiLimit(e) ? 429 : 502, e instanceof Error ? e.message : "Scout couldn't think of anything just now.");
    }
  })
  .get("/products/:id", async (c) => {
    const p = await c.get("db").select().from(products).where(eq(products.id, c.req.param("id"))).get();
    if (!p) throw new HttpError(404, "No such product");
    const d = p.data as { competitors?: CompetitorPrice[]; report?: { priceRangePence?: [number, number]; keywords?: string[] }; etsy?: unknown; deliverables?: unknown[] };
    return c.json({
      id: p.id,
      title: p.title,
      niche: p.niche,
      pricePence: p.pricePence,
      competitors: d.competitors ?? [],
      marketRangePence: d.report?.priceRangePence ?? null,
      keywords: d.report?.keywords ?? [],
      // 🛍️ The Etsy draft, once sent, and how many download files are ready for it.
      etsy: d.etsy ?? null,
      downloads: d.deliverables?.length ?? 0,
    });
  })
  // 🎨 The product's design style (picked the first time its files are built).
  .get("/products/:id/style", async (c) => {
    const style = await designStyleFor(c.get("db"), c.req.param("id"));
    if (!style) throw new HttpError(404, "No such product");
    return c.json({ style });
  })
  .put("/products/:id/style", async (c) => {
    const b = await body(c, z.object({ style: z.enum(STYLE_IDS as [string, ...string[]]) }));
    if (!(await setDesignStyle(c.get("db"), c.req.param("id"), b.style as (typeof STYLE_IDS)[number]))) throw new HttpError(404, "No such product");
    return c.json({ ok: true, style: b.style });
  })
  .put("/products/:id/competitors", async (c) => {
    // Prices you've spotted on similar Etsy listings.
    const b = await body(c, z.object({ competitors: z.array(z.object({ pricePence: z.number().int().min(1).max(100_000_00), note: z.string().max(120).optional() })).max(30) }));
    const db = c.get("db");
    const p = await db.select().from(products).where(eq(products.id, c.req.param("id"))).get();
    if (!p) throw new HttpError(404, "No such product");
    await db
      .update(products)
      .set({ data: { ...p.data, competitors: b.competitors }, updatedAt: new Date().toISOString() })
      .where(eq(products.id, p.id));
    return c.json({ ok: true, competitors: b.competitors });
  })
  .post("/tasks/:id/reopen", async (c) => {
    const t = await engineErrors(reopenTask(c.get("db"), c.req.param("id")));
    return c.json({ ok: true, id: t.id, state: t.state });
  })
  .post("/tasks/:id/retry", async (c) => {
    const t = await engineErrors(retryTask(c.get("db"), c.req.param("id")));
    return c.json({ ok: true, state: t.state });
  })
  .post("/events", async (c) => {
    // Only harmless, client-observable events can be posted from the browser.
    const b = await body(c, z.object({ type: z.enum(["room_visit", "fee_calc"]) }));
    const db = c.get("db");
    const demoMode = c.get("settings").demoMode;
    await recordEvent(db, b.type, demoMode);
    await checkAchievements(db, demoMode, demoMode);
    return c.json({ ok: true });
  })
  .get("/briefing", async (c) => c.json(await buildBriefing(c.get("db"), c.get("settings"))))
  .post("/briefing/seen", async (c) => {
    const db = c.get("db");
    await kvSet(db, "lastBriefing", new Date().toISOString().slice(0, 10));
    await recordEvent(db, "briefing_seen", c.get("settings").demoMode);
    return c.json({ ok: true });
  });
