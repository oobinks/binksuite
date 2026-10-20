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
import { aiServices } from "./app";
import { etsyClient } from "./providers/etsy";
import { vaultSecret } from "./lib/vault";
import { radarTick } from "./engine/trends";
import { priceWatchTick } from "./engine/priceWatch";
import { shopClient } from "./providers/etsyShop";
import { syncOrders } from "./engine/orders";
import { renewalTick } from "./engine/renewals";
import { strategyTick } from "./engine/strategy";
import { reviewsTick } from "./engine/care";
import { flushPushes } from "./engine/push";

const KEEP_LOGS_DAYS = 45;

export async function runCron(env: Env) {
  await ensureMigrated(env.DB);
  const db = getDb(env.DB);
  const settings = await getSettings(db);
  const ai = aiServices(env, db, settings);
  const key = await vaultSecret(db, env, "etsy");
  const etsy = key ? etsyClient(key, settings.fees.usdToGbp) : null;
  await tick(db, settings, { interactive: false, ai, files: env.FILES, etsy: async () => etsy });
  // 📡 Trend Radar + 🎯 today's ideas + 👀 Price Watch (a few Etsy calls per run).
  await radarTick(db, settings, { etsy, ai, budget: 6 }).catch((e) => console.error("radar", e));
  await priceWatchTick(db, settings, etsy, new Date(), 6).catch((e) => console.error("price watch", e));
  // 🧾 New Etsy orders (every 15 minutes, once your shop is connected).
  const shop = key ? await shopClient(db, env, key).catch(() => null) : null;
  if (shop) await syncOrders(db, settings, shop).catch((e) => console.error("orders", e));
  // ⏳ Expiry countdowns and keep-or-retire reviews (every 6 hours).
  if (shop) await renewalTick(db, shop).catch((e) => console.error("renewals", e));
  // Customer Care: new shop reviews (every 6 hours).
  if (shop) await reviewsTick(db, shop).catch((e) => console.error("reviews", e));
  await strategyTick(db, settings, ai).catch((e) => console.error("strategy", e));
  // Phone notifications from this run.
  await flushPushes(db, env).catch((e) => console.error("push", e));
  const cutoff = new Date(Date.now() - KEEP_LOGS_DAYS * 86_400_000).toISOString();
  await db.delete(activity).where(lt(activity.createdAt, cutoff));
  await db.delete(notifications).where(lt(notifications.createdAt, cutoff));
  await db.delete(handoffs).where(lt(handoffs.createdAt, cutoff));
}
