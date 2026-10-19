// ✨ AI engine: Claude Code, on the owner's Claude subscription.
//
// Nothing here calls an AI. Each request is saved to Claude's to-do list
// (claude_jobs) and the task waits (⛔ "Waiting for Claude"). When the owner is
// on the site, BinkSuite starts a Claude Code session (a routine) that works
// through the list and posts the answers back (routes/agent.ts). The waiting
// task then runs again, finds its answer here, and carries on.
import { and, eq } from "drizzle-orm";
import type { DB } from "../db";
import { claudeJobs } from "../db/schema";
import { nowIso } from "../lib/store";
import { sanitizeSvg, SvgError, ART_VIEWBOX } from "../../shared/svg";
import type { AiServices, JsonRequest } from "./ai";

export const CLAUDE_WAITING = "✨ Waiting for Claude. Start a Claude session from the ✨ bar at the top.";

export class ClaudePendingError extends Error {
  override name = "ClaudePendingError";
  constructor() {
    super(CLAUDE_WAITING);
  }
}

/** Matches by name too, so it works across module copies. */
export const isClaudePending = (e: unknown) => e instanceof ClaudePendingError || (e as Error | null)?.name === "ClaudePendingError";

async function sha(text: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Job = typeof claudeJobs.$inferSelect;
type TaskRef = { id: string; productId: string | null; title: string };

/** Find this request's job, or put a new one on the list. */
async function jobFor(db: DB, id: string, fields: Pick<Job, "kind" | "title" | "system" | "prompt" | "jsonSchema">, task?: TaskRef): Promise<Job> {
  const found = await db.select().from(claudeJobs).where(eq(claudeJobs.id, id)).get();
  if (found) return found;
  const now = nowIso();
  const row: Job = {
    id,
    taskId: task?.id ?? null,
    productId: task?.productId ?? null,
    ...fields,
    status: "waiting",
    answer: null,
    error: null,
    attempts: 0,
    claimedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(claudeJobs).values(row).onConflictDoNothing();
  return row;
}

/** An answer didn't work: put the job back on the list with the reason, so Claude can fix it. */
async function sendBack(db: DB, job: Job, error: string) {
  await db
    .update(claudeJobs)
    .set({ status: "waiting", error: error.slice(0, 2000), claimedAt: null, updatedAt: nowIso() })
    .where(and(eq(claudeJobs.id, job.id), eq(claudeJobs.status, "answered")));
}

/** Strip a ```json fence if Claude wrapped its answer in one. */
export function unfence(text: string) {
  return text.trim().replace(/^```(?:json|svg|xml)?\s*/i, "").replace(/\s*```$/, "");
}

const SVG_SYSTEM = `You are Designer for a small UK Etsy shop selling digital printables. Draw one finished, sellable piece of wall art as a standalone SVG.
Rules: return ONLY the SVG document. viewBox="0 0 ${ART_VIEWBOX.w} ${ART_VIEWBOX.h}". Fill the whole canvas with a background. No scripts, no external images or fonts, no links. Use generic font families (serif, sans-serif) for any lettering and keep text minimal unless the brief asks for words. No brands, characters or celebrities. Aim for the quality of a best-selling Etsy print: considered composition, a harmonious limited palette, varied shapes and texture (layered paths, gentle gradients, grain via patterns), not clip-art.`;

export function claudeCodeAi(db: DB, painter: AiServices | null, task?: TaskRef): AiServices {
  return {
    async json<T>(req: JsonRequest<T>): Promise<T> {
      const id = req.key ?? `${task?.id ?? "free"}:${await sha(req.system + "\n" + req.prompt)}`;
      const job = await jobFor(db, id, { kind: "json", title: req.label ?? task?.title ?? "AI request", system: req.system, prompt: req.prompt, jsonSchema: req.jsonSchema }, task);
      if (job.status !== "answered" || job.answer === null) throw new ClaudePendingError();
      let parsed: unknown;
      try {
        parsed = JSON.parse(unfence(job.answer));
      } catch {
        await sendBack(db, job, "That answer wasn't valid JSON. Send only the JSON object.");
        throw new ClaudePendingError();
      }
      const r = req.schema.safeParse(parsed);
      if (!r.success) {
        const issues = r.error.issues.slice(0, 6).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
        await sendBack(db, job, `The answer didn't match the schema: ${issues}`);
        throw new ClaudePendingError();
      }
      return r.data;
    },
    async svg(prompt: string): Promise<string> {
      const id = `${task?.id ?? "free"}:svg:${await sha(prompt)}`;
      const job = await jobFor(db, id, { kind: "svg", title: task?.title ?? "Artwork", system: SVG_SYSTEM, prompt, jsonSchema: null }, task);
      if (job.status !== "answered" || job.answer === null) throw new ClaudePendingError();
      try {
        return sanitizeSvg(unfence(job.answer));
      } catch (e) {
        if (!(e instanceof SvgError)) throw e;
        await sendBack(db, job, e.message);
        throw new ClaudePendingError();
      }
    },
    // Claude can't paint photos: room backgrounds for mockups use the free painter when there is one.
    async image(prompt: string): Promise<string> {
      if (!painter) throw new Error("No picture painter available.");
      return painter.image(prompt);
    },
    forTask: (t) => claudeCodeAi(db, painter, t),
  };
}
