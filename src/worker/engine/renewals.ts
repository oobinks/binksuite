// ⏳ Renewals: Etsy listings last 4 months and BinkSuite creates them with auto-renew
// off. A few times a day this reads each sent listing from Etsy (state, expiry date,
// views and favourites). A week before one expires, you get a keep-or-retire review
// with how it has done. You renew on Etsy yourself, or let it expire.
import { and, eq, sql } from "drizzle-orm";
import type { DB } from "../db";
import { approvals, ledger, products, tasks } from "../db/schema";
import { newId } from "../lib/crypto";
import { kvGet, kvSet, nowIso } from "../lib/store";
import type { ShopClient } from "../providers/etsyShop";
import type { EtsyDraftInfo } from "./etsyPublish";
import { logActivity } from "./queue";
import { queuePush } from "./push";

export const REVIEW_DAYS = 7;
const CHECK_EVERY_MS = 6 * 3600_000;
const DAY = 86_400_000;

/** What Etsy says about a sent listing right now. */
export interface EtsyLive {
  state: string;
  endsAt: string | null;
  views: number;
  favourites: number;
  checkedAt: string;
  url?: string;
}

export interface RenewalReview {
  listingId: number;
  title: string;
  endsAt: string;
  daysLeft: number;
  daysLive: number | null;
  sales: number;
  revenuePence: number;
  views: number;
  favourites: number;
  pricePence: number | null;
  verdict: "keep" | "maybe" | "retire";
  why: string;
  manageUrl: string;
}

export const daysLeft = (endsAt: string, now = new Date()) => Math.max(0, Math.ceil((new Date(endsAt).getTime() - now.getTime()) / DAY));

/** Sales pay for themselves; interest might; nothing after months is a sign to stop. */
export function renewalVerdict(s: { sales: number; views: number; favourites: number; daysLive: number | null }): { verdict: RenewalReview["verdict"]; why: string } {
  if (s.sales > 0) return { verdict: "keep", why: `${s.sales} sale${s.sales === 1 ? "" : "s"} so far: well worth the small renewal fee.` };
  if (s.favourites >= 5 || s.views >= 150)
    return { verdict: "maybe", why: `No sales yet, but ${s.favourites} favourites and ${s.views} views show interest. A fresh title, photos or a lower price could tip it.` };
  return { verdict: "retire", why: `No sales and little interest (${s.favourites} favourites, ${s.views} views)${s.daysLive ? ` in ${s.daysLive} days` : ""}. Let it expire and make room for a better idea.` };
}

/** Read each sent listing from Etsy, and raise a review for any within a week of expiring. */
export async function renewalTick(db: DB, shop: ShopClient, opts: { now?: Date; force?: boolean; budget?: number } = {}): Promise<{ checked: number; reviews: number }> {
  const now = opts.now ?? new Date();
  const last = (await kvGet<number>(db, "renewalsCheckedAt")) ?? 0;
  if (!opts.force && now.getTime() - last < CHECK_EVERY_MS) return { checked: 0, reviews: 0 };
  await kvSet(db, "renewalsCheckedAt", now.getTime());
  const rows = await db
    .select()
    .from(products)
    .where(and(eq(products.demo, false), sql`json_extract(${products.data}, '$.etsy.listingId') IS NOT NULL`))
    .all();
  let checked = 0;
  let reviews = 0;
  for (const p of rows.slice(0, opts.budget ?? 30)) {
    const d = p.data as { etsy: EtsyDraftInfo; etsyLive?: EtsyLive; launchedAt?: string };
    let l;
    try {
      l = await shop.listing(d.etsy.listingId);
    } catch {
      continue; // deleted on Etsy, or a hiccup: try again next time
    }
    checked++;
    const live: EtsyLive = {
      state: l.state,
      endsAt: l.ending_timestamp ? new Date(l.ending_timestamp * 1000).toISOString() : null,
      views: l.views ?? 0,
      favourites: l.num_favorers ?? 0,
      checkedAt: nowIso(now),
      url: l.url,
    };
    // Published on Etsy → live here; expired on Etsy → retired here.
    const stage = live.state === "active" ? "live" : live.state === "expired" || live.state === "inactive" ? "expired" : p.stage;
    await db
      .update(products)
      .set({ data: { ...p.data, etsyLive: live, ...(live.state === "active" && !d.launchedAt ? { launchedAt: nowIso(now) } : {}) }, stage, updatedAt: nowIso(now) })
      .where(eq(products.id, p.id));
    if (live.state === "active" && live.endsAt && daysLeft(live.endsAt, now) <= REVIEW_DAYS && (await raiseReview(db, p, d.etsy, live, now))) reviews++;
  }
  return { checked, reviews };
}

async function raiseReview(db: DB, p: typeof products.$inferSelect, etsy: EtsyDraftInfo, live: EtsyLive, now: Date): Promise<boolean> {
  const key = `${etsy.listingId}:${live.endsAt}`;
  const open = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.kind, "renewal_review"), sql`json_extract(${tasks.input}, '$.renewKey') = ${key}`))
    .get();
  if (open) return false;
  const sales = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number), total: sql<number>`coalesce(sum(${ledger.amountPence}), 0)`.mapWith(Number) })
    .from(ledger)
    .where(and(eq(ledger.productId, p.id), eq(ledger.kind, "sale"), eq(ledger.demo, false)))
    .get();
  const launchedAt = (p.data as { launchedAt?: string }).launchedAt;
  const daysLive = launchedAt ? Math.max(1, Math.round((now.getTime() - new Date(launchedAt).getTime()) / DAY)) : null;
  const stats = { sales: sales?.n ?? 0, views: live.views, favourites: live.favourites, daysLive };
  const review: RenewalReview = {
    listingId: etsy.listingId,
    title: p.title,
    endsAt: live.endsAt!,
    daysLeft: daysLeft(live.endsAt!, now),
    daysLive,
    sales: stats.sales,
    revenuePence: sales?.total ?? 0,
    views: live.views,
    favourites: live.favourites,
    pricePence: p.pricePence,
    ...renewalVerdict(stats),
    manageUrl: "https://www.etsy.com/your/shops/me/tools/listings",
  };
  const at = nowIso(now);
  const id = newId("t_");
  await db.insert(tasks).values({
    id,
    productId: p.id,
    room: "launch",
    agent: null,
    kind: "renewal_review",
    title: `Keep or retire: ${p.title.slice(0, 80)}`,
    state: "needs_approval",
    progress: 1,
    needsApproval: true,
    input: { renewKey: key },
    output: review as unknown as Record<string, unknown>,
    demo: false,
    createdAt: at,
    updatedAt: at,
    finishedAt: at,
  });
  await db.insert(approvals).values({ id: newId("a_"), taskId: id, kind: "review", summary: `Keep or retire: ${p.title}`, status: "pending", demo: false, createdAt: at });
  await logActivity(db, null, "launch", "finish", `⏳ “${p.title}” expires on Etsy in ${review.daysLeft} day${review.daysLeft === 1 ? "" : "s"}: keep or retire?`, false);
  await queuePush(db, "renewals", { title: `Expires in ${review.daysLeft} day${review.daysLeft === 1 ? "" : "s"}: keep or retire?`, body: p.title.slice(0, 120), url: "/room/launch", tag: `renew-${p.id}` });
  return true;
}
