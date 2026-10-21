// Shop analytics: the whole shop's numbers for a period, against the period before.
// Real data only: ledger sales/fees/costs, synced Etsy orders, BinkSuite's daily view and
// favourite readings (see performance.ts), reviews, and Etsy's own shop totals.
import { and, eq, gte } from "drizzle-orm";
import type { DB } from "../db";
import { ledger, products } from "../db/schema";
import { kvGet, kvSet } from "../lib/store";
import { formatOf, type ProductFormat } from "../../shared/format";
import type { ShopClient } from "../providers/etsyShop";
import { listingPerformance, type Verdict } from "./performance";
import { ordersList } from "./orders";

const DAY = 86_400_000;
const TZ = "Europe/London";

export interface EtsyShopTotals {
  admirers: number | null;
  reviewAverage: number | null;
  reviewCount: number | null;
  activeListings: number | null;
  soldAllTime: number | null;
  openedAt: string | null;
  at: string;
}

interface Totals {
  revenuePence: number;
  feesPence: number;
  costsPence: number;
  netPence: number;
  sales: number;
  orders: number;
  views: number | null;
  favourites: number | null;
}

export interface ShopAnalytics {
  days: number;
  from: string;
  to: string;
  now: Totals;
  before: Totals;
  /** Per day across the period: revenue, sales, views, favourites. */
  daily: { date: string; revenuePence: number; sales: number; views: number | null; favourites: number | null }[];
  byFormat: { format: ProductFormat; sales: number; revenuePence: number }[];
  byWeekday: { day: string; sales: number; revenuePence: number }[];
  byHour: { hour: number; sales: number }[];
  byPrice: { band: string; sales: number; revenuePence: number }[];
  topListings: { productId: string; title: string; revenuePence: number; sales: number; views: number | null; favourites: number | null; conversion: number | null }[];
  verdicts: Partial<Record<Verdict, number>>;
  reviews: { count: number; average: number | null; stars: number[] };
  etsy: EtsyShopTotals | null;
  /** True when some daily view history is missing (it builds up from when BinkSuite started reading it). */
  partialViews: boolean;
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

function londonParts(iso: string) {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", hour: "numeric", hour12: false });
  const parts = Object.fromEntries(f.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return { weekday: parts.weekday as string, hour: Number(parts.hour) % 24 };
}

/** Views and favourites per day, summed over every listing, from the daily readings. */
function dailyViews(history: Record<string, { d: string; views: number; favs: number }[]>, from: string, to: string) {
  const views = new Map<string, number>();
  const favs = new Map<string, number>();
  const covered = new Set<string>();
  for (const points of Object.values(history)) {
    for (let i = 1; i < points.length; i++) {
      const p = points[i];
      const prev = points[i - 1];
      if (p.d < from || p.d > to) continue;
      // Readings a few days apart: spread the gain over the gap.
      const gap = Math.max(1, Math.round((new Date(p.d).getTime() - new Date(prev.d).getTime()) / DAY));
      for (let g = 0; g < gap; g++) {
        const d = dayKey(new Date(new Date(p.d).getTime() - g * DAY));
        if (d < from) break;
        views.set(d, (views.get(d) ?? 0) + Math.max(0, p.views - prev.views) / gap);
        favs.set(d, (favs.get(d) ?? 0) + Math.max(0, p.favs - prev.favs) / gap);
        covered.add(d);
      }
    }
  }
  return { views, favs, covered };
}

const BANDS: [number, string][] = [
  [300, "Under £3"],
  [500, "£3–£4.99"],
  [800, "£5–£7.99"],
  [1200, "£8–£11.99"],
  [Infinity, "£12 and up"],
];

export async function etsyShopTotals(db: DB, shop: Pick<ShopClient, "shopStats"> | null, now = new Date()): Promise<EtsyShopTotals | null> {
  const cached = await kvGet<EtsyShopTotals>(db, "etsyShopTotals");
  if (cached && now.getTime() - new Date(cached.at).getTime() < 6 * 3600_000) return cached;
  if (!shop) return cached ?? null;
  try {
    const s = await shop.shopStats();
    const totals: EtsyShopTotals = {
      admirers: s.num_favorers ?? null,
      reviewAverage: s.review_average ?? null,
      reviewCount: s.review_count ?? null,
      activeListings: s.listing_active_count ?? null,
      soldAllTime: s.transaction_sold_count ?? null,
      openedAt: s.create_date ? new Date(s.create_date * 1000).toISOString() : null,
      at: now.toISOString(),
    };
    await kvSet(db, "etsyShopTotals", totals);
    return totals;
  } catch {
    return cached ?? null;
  }
}

export async function shopAnalytics(db: DB, days: number, opts: { now?: Date; etsy?: EtsyShopTotals | null } = {}): Promise<ShopAnalytics> {
  const now = opts.now ?? new Date();
  const start = new Date(now.getTime() - (days - 1) * DAY);
  const from = dayKey(start);
  const to = dayKey(now);
  const prevFrom = dayKey(new Date(start.getTime() - days * DAY));
  const [rows, prods, orders, history, perf, reviewCache] = await Promise.all([
    db.select().from(ledger).where(and(eq(ledger.demo, false), gte(ledger.date, prevFrom))).all(),
    db.select({ id: products.id, title: products.title, data: products.data, demo: products.demo }).from(products).where(eq(products.demo, false)).all(),
    ordersList(db),
    kvGet<Record<string, { d: string; views: number; favs: number }[]>>(db, "listingStats"),
    listingPerformance(db, now),
    kvGet<{ reviews: { rating: number; at: string }[] }>(db, "careReviews"),
  ]);
  const byId = new Map(prods.map((p) => [p.id, p]));
  const inNow = (d: string) => d.slice(0, 10) >= from && d.slice(0, 10) <= to;
  const inBefore = (d: string) => d.slice(0, 10) >= prevFrom && d.slice(0, 10) < from;

  const totals = (pick: (d: string) => boolean, viewFrom: string, viewTo: string): Totals => {
    const r = rows.filter((x) => pick(x.date));
    const sum = (k: string) => r.filter((x) => x.kind === k).reduce((a, x) => a + x.amountPence, 0);
    const revenuePence = sum("sale");
    const refunds = sum("refund");
    const feesPence = -sum("fee");
    const costsPence = -(sum("cost") + sum("api"));
    const v = dailyViews(history ?? {}, viewFrom, viewTo);
    const hasViews = v.covered.size > 0;
    return {
      revenuePence,
      feesPence,
      costsPence,
      netPence: revenuePence + refunds - feesPence - costsPence,
      sales: r.filter((x) => x.kind === "sale").length,
      orders: orders.filter((o) => pick(o.at)).length,
      views: hasViews ? Math.round([...v.views.values()].reduce((a, n) => a + n, 0)) : null,
      favourites: hasViews ? Math.round([...v.favs.values()].reduce((a, n) => a + n, 0)) : null,
    };
  };
  const nowTotals = totals(inNow, from, to);
  const beforeTotals = totals(inBefore, prevFrom, dayKey(new Date(start.getTime() - DAY)));

  const sales = rows.filter((x) => x.kind === "sale" && inNow(x.date));
  const v = dailyViews(history ?? {}, from, to);
  const daily: ShopAnalytics["daily"] = [];
  for (let i = 0; i < days; i++) {
    const d = dayKey(new Date(start.getTime() + i * DAY));
    const today = sales.filter((s) => s.date.slice(0, 10) === d);
    daily.push({
      date: d,
      revenuePence: today.reduce((a, s) => a + s.amountPence, 0),
      sales: today.length,
      views: v.covered.has(d) ? Math.round(v.views.get(d) ?? 0) : null,
      favourites: v.covered.has(d) ? Math.round(v.favs.get(d) ?? 0) : null,
    });
  }

  const fmt = new Map<ProductFormat, { sales: number; revenuePence: number }>();
  const wk = new Map<string, { sales: number; revenuePence: number }>(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => [d, { sales: 0, revenuePence: 0 }]));
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, sales: 0 }));
  const bands = new Map(BANDS.map(([, b]) => [b, { sales: 0, revenuePence: 0 }]));
  const per = new Map<string, { revenuePence: number; sales: number }>();
  for (const s of sales) {
    const p = s.productId ? byId.get(s.productId) : undefined;
    if (p) {
      const f = formatOf(p as Parameters<typeof formatOf>[0]);
      const e = fmt.get(f) ?? { sales: 0, revenuePence: 0 };
      e.sales++;
      e.revenuePence += s.amountPence;
      fmt.set(f, e);
      const t = per.get(p.id) ?? { revenuePence: 0, sales: 0 };
      t.sales++;
      t.revenuePence += s.amountPence;
      per.set(p.id, t);
    }
    const { weekday, hour } = londonParts(s.date);
    const w = wk.get(weekday);
    if (w) (w.sales++, (w.revenuePence += s.amountPence));
    hours[hour].sales++;
    const band = BANDS.find(([max]) => s.amountPence < max)![1];
    const bb = bands.get(band)!;
    bb.sales++;
    bb.revenuePence += s.amountPence;
  }

  const perfById = new Map(perf.map((p) => [p.productId, p]));
  const ids = new Set([...per.keys(), ...perf.map((p) => p.productId)]);
  const topListings = [...ids]
    .map((id) => {
      const s = per.get(id) ?? { revenuePence: 0, sales: 0 };
      const pf = perfById.get(id);
      const views = days <= 7 ? (pf?.views7 ?? null) : (pf?.views30 ?? null);
      return { productId: id, title: byId.get(id)?.title ?? pf?.title ?? "Product", revenuePence: s.revenuePence, sales: s.sales, views, favourites: pf?.favs30 ?? null, conversion: views ? s.sales / views : null };
    })
    .sort((a, b) => b.revenuePence - a.revenuePence || (b.views ?? 0) - (a.views ?? 0))
    .slice(0, 10);

  const verdicts: ShopAnalytics["verdicts"] = {};
  for (const p of perf) verdicts[p.verdict] = (verdicts[p.verdict] ?? 0) + 1;

  const allReviews = reviewCache?.reviews ?? [];
  const stars = [1, 2, 3, 4, 5].map((n) => allReviews.filter((r) => r.rating === n).length);
  const rated = allReviews.filter((r) => r.rating > 0);

  return {
    days,
    from,
    to,
    now: nowTotals,
    before: beforeTotals,
    daily,
    byFormat: [...fmt].map(([format, x]) => ({ format, ...x })).sort((a, b) => b.revenuePence - a.revenuePence),
    byWeekday: [...wk].map(([day, x]) => ({ day, ...x })),
    byHour: hours,
    byPrice: [...bands].map(([band, x]) => ({ band, ...x })),
    topListings,
    verdicts,
    reviews: { count: rated.length, average: rated.length ? Math.round((rated.reduce((a, r) => a + r.rating, 0) / rated.length) * 10) / 10 : null, stars },
    etsy: opts.etsy ?? null,
    partialViews: daily.some((d) => d.views === null),
  };
}
