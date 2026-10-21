// Listing performance: how each live Etsy listing is doing. The renewal checks read
// every sent listing's views and favourites from Etsy a few times a day; we keep one
// reading per day so we can tell views this week from views ever, and put them next
// to real sales from the ledger. Each listing gets a plain verdict and what to do.
import { and, eq, gte, sql } from "drizzle-orm";
import type { DB } from "../db";
import { ledger, products } from "../db/schema";
import type { RoomId } from "../../shared/registry";
import { kvGet, kvSet } from "../lib/store";
import type { EtsyLive } from "./renewals";

const DAY = 86_400_000;
const KEEP_DAYS = 120;
const STATS_KEY = "listingStats";

/** One day's reading (Etsy's running totals). */
interface Point {
  d: string;
  views: number;
  favs: number;
}

type History = Record<string, Point[]>;

export type Verdict = "new" | "star" | "steady" | "browsed" | "liked" | "hidden" | "off";

export interface ListingPerformance {
  productId: string;
  title: string;
  url: string | null;
  state: string;
  daysLive: number | null;
  views: number;
  favourites: number;
  /** Views and favourites in the last 7 / 30 days (null until there's enough history). */
  views7: number | null;
  views30: number | null;
  favs30: number | null;
  sales30: number;
  salesTotal: number;
  revenue30Pence: number;
  /** Sales per view, all time (0–1), when there are views to go on. */
  conversion: number | null;
  verdict: Verdict;
  headline: string;
  advice: string;
  room: RoomId | null;
  /** Daily views for the last 30 days, oldest first (for a little chart). */
  daily: number[];
  checkedAt: string | null;
}

/** Remember today's reading for a listing (called by the renewal checks). */
export async function recordListingStats(db: DB, productId: string, live: Pick<EtsyLive, "views" | "favourites">, now = new Date()) {
  const all = (await kvGet<History>(db, STATS_KEY)) ?? {};
  const d = now.toISOString().slice(0, 10);
  const points = (all[productId] ?? []).filter((p) => p.d !== d);
  points.push({ d, views: live.views, favs: live.favourites });
  const cutoff = new Date(now.getTime() - KEEP_DAYS * DAY).toISOString().slice(0, 10);
  all[productId] = points.filter((p) => p.d >= cutoff).sort((a, b) => a.d.localeCompare(b.d));
  await kvSet(db, STATS_KEY, all);
}

/** Growth of a running total over the last `days`, if the history reaches back far enough. */
function since(points: Point[], now: Date, days: number, field: "views" | "favs", sinceLive: number | null): number | null {
  if (!points.length) return null;
  const last = points[points.length - 1][field];
  const start = new Date(now.getTime() - days * DAY).toISOString().slice(0, 10);
  const before = [...points].reverse().find((p) => p.d <= start);
  if (before) return Math.max(0, last - before[field]);
  // A listing younger than the window: everything it has is from inside the window.
  if (sinceLive !== null && sinceLive <= days) return last;
  return null;
}

function dailyViews(points: Point[], now: Date): number[] {
  const byDay = new Map(points.map((p) => [p.d, p.views]));
  const out: number[] = [];
  let prev: number | null = null;
  for (let i = 30; i >= 0; i--) {
    const d = new Date(now.getTime() - i * DAY).toISOString().slice(0, 10);
    const v = byDay.get(d);
    if (i < 30) out.push(v !== undefined && prev !== null ? Math.max(0, v - prev) : 0);
    if (v !== undefined) prev = v;
  }
  return out;
}

const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;

/** The plain-English verdict for one listing. */
export function judge(s: { state: string; daysLive: number | null; views: number; favourites: number; views30: number | null; favs30: number | null; sales30: number; salesTotal: number }): Pick<ListingPerformance, "verdict" | "headline" | "advice" | "room" | "conversion"> {
  const conversion = s.views >= 20 ? s.salesTotal / s.views : null;
  if (s.state !== "active") return { verdict: "off", headline: "Not live on Etsy", advice: "It isn't active on Etsy right now, so it can't be found or bought.", room: "launch", conversion };
  if (s.daysLive !== null && s.daysLive < 7 && s.salesTotal === 0)
    return { verdict: "new", headline: "Too early to tell", advice: "New listings take a week or two to settle in Etsy search. Check back next week.", room: null, conversion };
  const views = s.views30 ?? s.views;
  const favs = s.favs30 ?? s.favourites;
  const sales = s.views30 !== null ? s.sales30 : s.salesTotal;
  if (sales >= 2 || (sales >= 1 && conversion !== null && conversion >= 0.02))
    return { verdict: "star", headline: "Selling well", advice: `${sales} sale${sales === 1 ? "" : "s"}${conversion !== null ? `, ${pct(conversion)} of views buy` : ""}. Promote it, and think about a bundle or a sister product.`, room: "marketing", conversion };
  if (views < 20)
    return { verdict: "hidden", headline: "Hardly anyone sees it", advice: `Only ${views} view${views === 1 ? "" : "s"}${s.views30 !== null ? " in 30 days" : ""}. Buyers aren't finding it: use the search phrases buyers type in the title and tags.`, room: "listing", conversion };
  if (sales >= 1) return { verdict: "steady", headline: "Selling", advice: `${sales} sale${sales === 1 ? "" : "s"} from ${views} views. A stronger first photo or a sharper title could lift it.`, room: "mockups", conversion };
  if (favs / views >= 0.05)
    return { verdict: "liked", headline: "Liked, not bought", advice: `${favs} favourites from ${views} views, but no sales. People want it: check the price against similar listings, or offer it in a bundle.`, room: "listing", conversion };
  return { verdict: "browsed", headline: "Looked at, not bought", advice: `${views} views but no sales. People click and move on: make the first photo show exactly what they get, and check the price.`, room: "mockups", conversion };
}

const ORDER: Verdict[] = ["browsed", "liked", "hidden", "off", "steady", "star", "new"];

/** Every listing sent to Etsy, best to act on first. */
export async function listingPerformance(db: DB, now = new Date()): Promise<ListingPerformance[]> {
  const [rows, history, sales] = await Promise.all([
    db
      .select()
      .from(products)
      .where(and(eq(products.demo, false), sql`json_extract(${products.data}, '$.etsy.listingId') IS NOT NULL`))
      .all(),
    kvGet<History>(db, STATS_KEY),
    db
      .select({ productId: ledger.productId, date: ledger.date, amountPence: ledger.amountPence })
      .from(ledger)
      .where(and(eq(ledger.kind, "sale"), eq(ledger.demo, false), gte(ledger.date, "2000-01-01")))
      .all(),
  ]);
  const monthAgo = new Date(now.getTime() - 30 * DAY).toISOString();
  return rows
    .map((p) => {
      const d = p.data as { etsy?: { url?: string }; etsyLive?: EtsyLive; launchedAt?: string };
      const live = d.etsyLive;
      const points = history?.[p.id] ?? [];
      const daysLive = d.launchedAt ? Math.max(0, Math.floor((now.getTime() - new Date(d.launchedAt).getTime()) / DAY)) : null;
      const mine = sales.filter((s) => s.productId === p.id);
      const recent = mine.filter((s) => s.date >= monthAgo);
      const facts = {
        state: live?.state ?? "draft",
        daysLive,
        views: live?.views ?? 0,
        favourites: live?.favourites ?? 0,
        views30: since(points, now, 30, "views", daysLive),
        favs30: since(points, now, 30, "favs", daysLive),
        sales30: recent.length,
        salesTotal: mine.length,
      };
      return {
        productId: p.id,
        title: p.title,
        url: live?.url ?? d.etsy?.url ?? null,
        views7: since(points, now, 7, "views", daysLive),
        revenue30Pence: recent.reduce((a, s) => a + s.amountPence, 0),
        daily: dailyViews(points, now),
        checkedAt: live?.checkedAt ?? null,
        ...facts,
        ...judge(facts),
      };
    })
    .sort((a, b) => ORDER.indexOf(a.verdict) - ORDER.indexOf(b.verdict) || (b.views30 ?? b.views) - (a.views30 ?? a.views));
}

/** A few lines for Manager's weekly report. */
export function performanceFacts(list: ListingPerformance[]): string {
  if (!list.length) return "Listing performance: nothing sent to Etsy yet.";
  const count = (v: Verdict) => list.filter((l) => l.verdict === v).length;
  const lines = [
    `Listing performance (views and favourites from Etsy, last 30 days where known): ${list.length} listing${list.length === 1 ? "" : "s"} on Etsy. Selling well: ${count("star")}; selling: ${count("steady")}; looked at but not bought: ${count("browsed")}; liked but not bought: ${count("liked")}; hardly seen: ${count("hidden")}; too new to judge: ${count("new")}; not active: ${count("off")}.`,
  ];
  for (const l of list.filter((x) => x.verdict !== "new").slice(0, 6))
    lines.push(`- "${l.title}": ${l.views30 ?? l.views} views, ${l.favs30 ?? l.favourites} favourites, ${l.sales30} sales in 30 days. ${l.headline}.`);
  return lines.join("\n");
}
