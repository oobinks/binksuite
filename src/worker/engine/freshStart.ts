// "Start fresh": remove every product (real and demo) and everything made for them, so
// you can launch real products from a clean shop. Kept: your money records, Etsy orders
// and reviews, settings and keys, XP and achievements, weekly reports, the trend radar,
// and today's ideas (which go back to "not sent yet"). Nothing is touched on Etsy itself.
import { isNotNull, sql } from "drizzle-orm";
import type { DB } from "../db";
import { activity, claudeJobs, handoffs, kv, products, tasks } from "../db/schema";
import { invalidateStats, kvGet, kvSet } from "../lib/store";
import { clearDemoData } from "../../../seed/demo";

export interface FreshStartResult {
  products: number;
  tasks: number;
  files: number;
}

/** Delete every file under products/ in storage. */
async function clearProductFiles(files: R2Bucket): Promise<number> {
  let removed = 0;
  for (let page = 0; page < 50; page++) {
    const list = await files.list({ prefix: "products/", limit: 1000 });
    if (!list.objects.length) break;
    await files.delete(list.objects.map((o) => o.key));
    removed += list.objects.length;
    if (!list.truncated) break;
  }
  return removed;
}

export async function startFresh(db: DB, files: R2Bucket, now = new Date()): Promise<FreshStartResult> {
  const [{ n: productCount }] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(products).all();
  const [{ n: taskCount }] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(tasks).where(isNotNull(tasks.productId)).all();

  // Demo rows of every kind (including pretend sales).
  await clearDemoData(db);
  // Real products and their work. Claude jobs that aren't about a product (e.g. today's ideas) stay.
  await db.delete(claudeJobs).where(isNotNull(claudeJobs.productId));
  await db.run(sql`DELETE FROM claude_jobs WHERE task_id IS NOT NULL AND task_id IN (SELECT id FROM tasks WHERE product_id IS NOT NULL)`);
  await db.delete(tasks).where(isNotNull(tasks.productId));
  await db.run(sql`DELETE FROM approvals WHERE task_id NOT IN (SELECT id FROM tasks)`);
  await db.delete(handoffs);
  await db.delete(activity);
  await db.delete(products);

  // What other rooms remembered about those products.
  await db.delete(kv).where(sql`${kv.key} LIKE 'pins:%' OR ${kv.key} IN ('listingStats', 'marketingCalendar', 'pushOutbox')`);

  // Today's ideas stay, ready to send to the task board again.
  const key = `daily:${now.toISOString().slice(0, 10)}`;
  const daily = await kvGet<{ pickedId?: string; items: { productId?: string }[] }>(db, key);
  if (daily) {
    for (const i of daily.items) delete i.productId;
    delete daily.pickedId;
    await kvSet(db, key, daily);
  }

  const removedFiles = await clearProductFiles(files);
  await invalidateStats(db);
  return { products: productCount, tasks: taskCount, files: removedFiles };
}
