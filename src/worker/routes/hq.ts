// The HQ: state snapshot (polled), rooms, agents, tasks, events, briefing.
import { and, desc, eq, inArray, or, gte } from "drizzle-orm";
import { z } from "zod";
import { newApp, body, HttpError } from "../app";
import { activity, products, tasks } from "../db/schema";
import { secretsStatus } from "../env";
import { kvSet, visible } from "../lib/store";
import { tick, approveTask, rejectTask, retryTask, EngineError } from "../engine/queue";
import { buildBriefing, buildSnapshot } from "../engine/snapshot";
import { recordEvent, checkAchievements } from "../engine/game";
import { AGENT_BY_ID, ROOM_BY_ID, type AgentId, type RoomId } from "../../shared/registry";
import type { ActivityView, TaskView } from "../../shared/api";
import type { DB } from "../db";

const TASK_HISTORY_MS = 3 * 86_400_000;

async function taskViews(db: DB, where: Parameters<typeof and>[number], demoMode: boolean): Promise<TaskView[]> {
  const cutoff = new Date(Date.now() - TASK_HISTORY_MS).toISOString();
  const rows = await db
    .select({ t: tasks, productTitle: products.title })
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
  return rows.map(({ t, productTitle }) => ({
    id: t.id,
    productId: t.productId,
    productTitle: productTitle ?? "",
    room: t.room as RoomId,
    agent: t.agent as AgentId | null,
    kind: t.kind,
    title: t.title,
    state: t.state as TaskView["state"],
    progress: t.progress,
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
    await tick(db, settings, { interactive: true });
    const snap = await buildSnapshot(db, settings, {
      afterNotification: Number(c.req.query("n") ?? 0) || 0,
      afterHandoff: Number(c.req.query("h") ?? 0) || 0,
      secrets: secretsStatus(c.env),
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
    const b = await body(c, z.object({ note: z.string().max(500).optional() }));
    const t = await engineErrors(approveTask(c.get("db"), c.req.param("id"), c.get("settings"), b.note));
    return c.json({ ok: true, state: t.state });
  })
  .post("/tasks/:id/reject", async (c) => {
    const b = await body(c, z.object({ note: z.string().max(500).default("") }));
    const t = await engineErrors(rejectTask(c.get("db"), c.req.param("id"), b.note));
    return c.json({ ok: true, state: t.state });
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
