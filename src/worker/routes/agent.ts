// ✨ The door for Claude Code sessions (your subscription) to work through Claude's
// to-do list. Not for people: it uses a connection key (Settings → Claude Code),
// sent as "Authorization: Bearer …", instead of your login.
import { and, eq, inArray, lt, or, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { newApp, body, HttpError, aiFor, type Ctx } from "../app";
import { claudeJobs, products, tasks } from "../db/schema";
import { kvGet, kvSet, nowIso } from "../lib/store";
import { sanitizeSvg, SvgError } from "../../shared/svg";
import { unfence } from "../providers/claudeCode";
import { tick } from "../engine/queue";
import { makeDailyIdeas, radarTick } from "../engine/trends";
import { notify } from "../engine/game";
import { formatOf } from "../../shared/format";
import { etsyFor } from "./radar";
import type { EtsyClient } from "../providers/etsy";

const STALE_CLAIM_MS = 20 * 60_000;

export async function sha256Hex(text: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time compare of two hex strings. */
function sameHex(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Jobs that are free to pick up: waiting, or claimed by a session that went quiet. */
const available = () =>
  or(eq(claudeJobs.status, "waiting"), and(eq(claudeJobs.status, "working"), lt(claudeJobs.claimedAt, new Date(Date.now() - STALE_CLAIM_MS).toISOString())));

/** Drop jobs whose task has moved on (dropped, failed, redone), so Claude never works on them. */
async function tidyJobs(c: Ctx) {
  const db = c.get("db");
  const orphans = await db
    .select({ id: claudeJobs.id })
    .from(claudeJobs)
    .leftJoin(tasks, eq(tasks.id, claudeJobs.taskId))
    .where(and(inArray(claudeJobs.status, ["waiting", "working"]), sql`${claudeJobs.taskId} IS NOT NULL`, or(isNull(tasks.id), sql`${tasks.state} NOT IN ('blocked','queued','working')`)))
    .all();
  if (orphans.length) await db.delete(claudeJobs).where(inArray(claudeJobs.id, orphans.map((o) => o.id)));
  // Ideas and estimates are only useful on the day they were asked for.
  await db
    .delete(claudeJobs)
    .where(and(isNull(claudeJobs.taskId), inArray(claudeJobs.status, ["waiting", "working"]), lt(claudeJobs.createdAt, new Date(Date.now() - 36 * 3600_000).toISOString())));
}

/** Let the pipeline move on after an answer: run the engine until it settles (or asks Claude for more). */
async function settle(c: Ctx) {
  const ai = aiFor(c);
  let etsy: Promise<EtsyClient | null> | null = null;
  const openEtsy = () => (etsy ??= etsyFor(c));
  for (let i = 0; i < 6; i++) await tick(c.get("db"), c.get("settings"), { interactive: false, ai, files: c.env.FILES, etsy: openEtsy });
}

export const agentRoutes = newApp()
  .use("*", async (c, next) => {
    const header = c.req.header("authorization") ?? "";
    const key = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    const stored = await kvGet<string>(c.get("db"), "claudeAgentKey");
    if (!key || !stored || !sameHex(await sha256Hex(key), stored)) throw new HttpError(401, "Unknown connection key. Make a new one in BinkSuite → Settings → Claude Code.");
    await next();
  })
  .get("/jobs", async (c) => {
    const db = c.get("db");
    await tidyJobs(c);
    const rows = await db.select().from(claudeJobs).where(available()).orderBy(claudeJobs.createdAt).limit(25).all();
    const ids = [...new Set(rows.map((r) => r.productId).filter((x): x is string => !!x))];
    const prods = ids.length ? await db.select().from(products).where(inArray(products.id, ids)).all() : [];
    return c.json({
      shop: { name: "BinkSuite", settings: { currency: "GBP", tone: c.get("settings").toneOfVoice } },
      jobs: rows.map((j) => {
        const p = prods.find((x) => x.id === j.productId);
        return {
          id: j.id,
          kind: j.kind,
          title: j.title,
          product: p ? { id: p.id, title: p.title, format: formatOf(p) } : null,
          system: j.system,
          prompt: j.prompt,
          jsonSchema: j.jsonSchema,
          previousProblem: j.error,
          attempts: j.attempts,
        };
      }),
    });
  })
  .post("/jobs/:id/claim", async (c) => {
    const res = await c
      .get("db")
      .update(claudeJobs)
      .set({ status: "working", claimedAt: nowIso(), updatedAt: nowIso() })
      .where(and(eq(claudeJobs.id, c.req.param("id")), available()))
      .run();
    return c.json({ ok: res.meta.changes > 0 });
  })
  .post("/jobs/:id/answer", async (c) => {
    const db = c.get("db");
    const b = await body(c, z.object({ answer: z.string().min(2).max(300_000) }));
    const job = await db.select().from(claudeJobs).where(eq(claudeJobs.id, c.req.param("id"))).get();
    if (!job) throw new HttpError(404, "That job isn't on the list any more (its product may have moved on).");
    // Quick checks first, so a broken answer is fixed in the same session.
    const text = unfence(b.answer);
    if (job.kind === "json") {
      try {
        JSON.parse(text);
      } catch {
        throw new HttpError(400, "That isn't valid JSON. Send only the JSON object.");
      }
    } else {
      try {
        sanitizeSvg(text);
      } catch (e) {
        throw new HttpError(400, e instanceof SvgError ? e.message : "That SVG couldn't be read.");
      }
    }
    await db
      .update(claudeJobs)
      .set({ status: "answered", answer: text, error: null, attempts: job.attempts + 1, updatedAt: nowIso() })
      .where(eq(claudeJobs.id, job.id));

    // Put the answer to use straight away.
    const settings = c.get("settings");
    if (job.taskId) await settle(c);
    else if (job.id.startsWith("daily:")) await makeDailyIdeas(db, settings, aiFor(c)!).catch(() => null);
    else if (job.id.startsWith("estimate:")) await radarTick(db, settings, { etsy: await etsyFor(c), ai: aiFor(c), budget: 0 }).catch(() => null);

    const after = await db.select().from(claudeJobs).where(eq(claudeJobs.id, job.id)).get();
    const waiting = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(claudeJobs).where(available()).get();
    if (after && after.status === "waiting") return c.json({ ok: false, problem: after.error, jobsWaiting: waiting?.n ?? 0 }, 422);
    const task = job.taskId ? await db.select({ state: tasks.state, title: tasks.title }).from(tasks).where(eq(tasks.id, job.taskId)).get() : null;
    return c.json({ ok: true, task, jobsWaiting: waiting?.n ?? 0 });
  })
  .post("/done", async (c) => {
    const b = await body(c, z.object({ answered: z.number().int().min(0).max(1000), note: z.string().max(500).optional() }));
    const db = c.get("db");
    const run = (await kvGet<Record<string, unknown>>(db, "claudeRun")) ?? {};
    await kvSet(db, "claudeRun", { ...run, finishedAt: nowIso(), answered: b.answered });
    if (b.answered) await notify(db, "quest", `✨ Claude made ${b.answered} thing${b.answered === 1 ? "" : "s"}`, b.note ?? "Have a look: some may be waiting for your approval.", false);
    return c.json({ ok: true });
  });
