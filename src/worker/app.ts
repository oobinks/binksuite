import { Hono, type Context } from "hono";
import { z } from "zod";
import type { Env } from "./env";
import { getDb, type DB } from "./db";
import type { Settings } from "../shared/settings";

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
