// Every 5 minutes: advance queued/working tasks and tidy old logs.
// The demo simulator doesn't invent products or sales from the cron —
// only while you have the app open.
import { lt } from "drizzle-orm";
import type { Env } from "./env";
import { getDb } from "./db";
import { ensureMigrated } from "./db/migrate";
import { activity, notifications, handoffs } from "./db/schema";
import { getSettings } from "./lib/store";
import { tick } from "./engine/queue";
import { workersAi } from "./providers/ai";

const KEEP_LOGS_DAYS = 45;

export async function runCron(env: Env) {
  await ensureMigrated(env.DB);
  const db = getDb(env.DB);
  const settings = await getSettings(db);
  const ai = env.AI && settings.ai.enabled ? workersAi(env.AI, db, settings) : null;
  await tick(db, settings, { interactive: false, ai, files: env.FILES });
  const cutoff = new Date(Date.now() - KEEP_LOGS_DAYS * 86_400_000).toISOString();
  await db.delete(activity).where(lt(activity.createdAt, cutoff));
  await db.delete(notifications).where(lt(notifications.createdAt, cutoff));
  await db.delete(handoffs).where(lt(handoffs.createdAt, cutoff));
}
