import { Hono, type Context } from "hono";
import { z } from "zod";
import type { Env } from "./env";
import { getDb, type DB } from "./db";
import type { Settings } from "../shared/settings";
import { workersAi } from "./providers/ai";
import { fakeAi } from "./providers/fakeAi";
import { claudeCodeAi } from "./providers/claudeCode";

export type AppEnv = { Bindings: Env; Variables: { db: DB; settings: Settings } };
export type Ctx = Context<AppEnv>;

export const newApp = () => new Hono<AppEnv>();

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function body<T extends z.ZodType>(c: Ctx, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new HttpError(400, "Expected a JSON body");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new HttpError(400, first ? `${first.path.join(".") || "body"}: ${first.message}` : "Invalid request");
  }
  return parsed.data;
}

export function dbFor(env: Env) {
  return getDb(env.DB);
}

/** The free Cloudflare painter (also paints mockup rooms when Claude does the rest). */
function workersFor(env: Env, db: DB, settings: Settings) {
  if (env.FAKE_AI === "1") return fakeAi;
  return env.AI ? workersAi(env.AI, db, settings) : null;
}

/** The AI engine in use: Claude Code (your subscription) or free Workers AI. Null when it's off or unavailable. */
export function aiServices(env: Env, db: DB, settings: Settings) {
  if (!settings.ai.enabled) return null;
  if (settings.ai.provider === "claude-code") return claudeCodeAi(db, workersFor(env, db, settings));
  return workersFor(env, db, settings);
}

/** Real AI for this request, or null when it's off or unavailable. */
export function aiFor(c: Ctx) {
  return aiServices(c.env, c.get("db"), c.get("settings"));
}
