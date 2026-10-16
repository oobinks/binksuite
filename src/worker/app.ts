import { Hono, type Context } from "hono";
import { z } from "zod";
import type { Env } from "./env";
import { getDb, type DB } from "./db";
import type { Settings } from "../shared/settings";
import { workersAi } from "./providers/ai";
import { fakeAi } from "./providers/fakeAi";

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

/** Real AI for this request, or null when it's off or unavailable. */
export function aiFor(c: Ctx) {
  const settings = c.get("settings");
  if (!settings.ai.enabled) return null;
  if (c.env.FAKE_AI === "1") return fakeAi;
  return c.env.AI ? workersAi(c.env.AI, c.get("db"), settings) : null;
}
