// 👀 Price Watch: once a day, compare your live prices with the market and raise a
// ❗ in the Listing Office when one is priced too far above similar listings.
//  - Products launched from BinkSuite: uses your competitor checks, or live Etsy data.
//  - Your whole Etsy shop (with an Etsy key + shop name in Settings): every active listing.
import { and, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "../db";
import { approvals, products, tasks } from "../db/schema";
import { newId } from "../lib/crypto";
import { kvGet, kvSet, nowIso } from "../lib/store";
import { priceAlert, readMarket, undercutPrice } from "../../shared/market";
import { priceStats, type CompetitorPrice } from "../../shared/pricing";
import { minimumPriceFor } from "../../shared/fees";
import type { Settings } from "../../shared/settings";
import type { EtsyClient, EtsyListing } from "../providers/etsy";
import { logActivity } from "./queue";

export interface WatchAlert {
  watchKey: string;
  title: string;
  ourPricePence: number;
  medianPricePence: number;
  lowPricePence: number;
  percentAbove: number;
  suggestedPricePence: number;
  basedOn: string;
  url?: string;
  searchQuery: string;
  productId?: string | null;
}

/** Raise (or skip, if one's already open) a Price Watch alert. */
export async function raiseAlert(db: DB, a: WatchAlert, demo = false): Promise<boolean> {
  const open = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.kind, "price_watch"), eq(tasks.state, "needs_approval"), sql`json_extract(${tasks.input}, '$.watchKey') = ${a.watchKey}`))
    .get();
  if (open) return false;
  const now = nowIso();
  const id = newId("t_");
  await db.insert(tasks).values({
    id,
    productId: a.productId ?? null,
    room: "listing",
    agent: "pricer",
    kind: "price_watch",
    title: `Price check: ${a.title.slice(0, 80)}`,
    state: "needs_approval",
    progress: 1,
    needsApproval: true,
    input: { watchKey: a.watchKey },
    output: a as unknown as Record<string, unknown>,
    demo,
    createdAt: now,
    updatedAt: now,
    finishedAt: now,
  });
  await db.insert(approvals).values({ id: newId("a_"), taskId: id, kind: "review", summary: `Price check: ${a.title}`, status: "pending", demo, createdAt: now });
  await logActivity(db, "pricer", "listing", "finish", `👀 “${a.title}” is ${a.percentAbove}% above similar listings`, demo);
  return true;
}

function buildAlert(settings: Settings, base: Omit<WatchAlert, "suggestedPricePence" | "percentAbove">): WatchAlert | null {
  const { tooHigh, percentAbove } = priceAlert(base.ourPricePence, base.medianPricePence, settings.radar.priceTolerancePercent);
  if (!tooHigh) return null;
  const floor = minimumPriceFor(settings.minProfitPence, 10, settings.fees);
  return { ...base, percentAbove, suggestedPricePence: undercutPrice(base.medianPricePence, settings.radar.undercutPercent, floor) };
}

const firstWords = (title: string, n = 4) => title.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean).slice(0, n).join(" ");

interface WatchState {
  day: string;
  productsDone: boolean;
  shopCursor: number;
  shopDone: boolean;
  alerts: number;
}

/** One Price Watch pass; spreads the day's checks over several runs to stay within limits. */
export async function priceWatchTick(db: DB, settings: Settings, etsy: EtsyClient | null, now = new Date(), budget = 6): Promise<number> {
  const day = now.toISOString().slice(0, 10);
  const state = (await kvGet<WatchState>(db, "priceWatch")) ?? null;
  const st: WatchState = state && state.day === day ? state : { day, productsDone: false, shopCursor: 0, shopDone: false, alerts: 0 };
  if (st.productsDone && (st.shopDone || !etsy || !settings.radar.etsyShopName)) return 0;
  let raised = 0;

  // 1. Products you launched from BinkSuite.
  if (!st.productsDone) {
    const live = await db
      .select()
      .from(products)
      .where(and(eq(products.stage, "live"), eq(products.demo, false), sql`${products.pricePence} IS NOT NULL`))
      .limit(50)
      .all();
    for (const p of live) {
      const d = p.data as { competitors?: CompetitorPrice[]; market?: { keyword?: string }; trendKeyword?: string; report?: { keywords?: string[] } };
      let median = priceStats((d.competitors ?? []).map((c) => c.pricePence));
      let low = median?.minPence ?? 0;
      let basedOn = "your competitor checks";
      const query = d.trendKeyword ?? d.market?.keyword ?? d.report?.keywords?.[0] ?? firstWords(p.title);
      if (!median && etsy && budget > 0) {
        budget--;
        const r = await etsy.search(query, "score", 50).catch(() => null);
        const m = r ? readMarket(r.listings, r.total, now) : null;
        if (m) {
          median = { count: r!.listings.length, averagePence: m.medianPricePence, medianPence: m.medianPricePence, minPence: m.lowPricePence, maxPence: m.medianPricePence };
          low = m.lowPricePence;
          basedOn = `live Etsy data (${r!.total.toLocaleString()} listings)`;
        }
      }
      if (!median) continue;
      const alert = buildAlert(settings, { watchKey: `product:${p.id}`, title: p.title, ourPricePence: p.pricePence!, medianPricePence: median.medianPence, lowPricePence: low, basedOn, searchQuery: query, productId: p.id });
      if (alert && (await raiseAlert(db, alert))) raised++;
    }
    st.productsDone = true;
  }

  // 2. Every active listing in your Etsy shop.
  if (etsy && settings.radar.etsyShopName && !st.shopDone && budget > 1) {
    let shop = await kvGet<{ name: string; shopId: number }>(db, "etsyShop");
    if (!shop || shop.name.toLowerCase() !== settings.radar.etsyShopName.toLowerCase()) {
      const found = await etsy.findShop(settings.radar.etsyShopName);
      budget--;
      if (!found) {
        await kvSet(db, "radarError", { at: nowIso(now), message: `Couldn't find an Etsy shop called “${settings.radar.etsyShopName}”.` });
        st.shopDone = true;
      } else {
        shop = { name: settings.radar.etsyShopName, shopId: found.shopId };
        await kvSet(db, "etsyShop", shop);
      }
    }
    if (shop && !st.shopDone) {
      const mine: EtsyListing[] = await etsy.shopListings(shop.shopId, 100);
      budget--;
      while (st.shopCursor < mine.length && budget > 0) {
        const l = mine[st.shopCursor++];
        const query = l.tags[0] ?? firstWords(l.title);
        budget--;
        const r = await etsy.search(query, "score", 50).catch(() => null);
        if (!r) continue;
        const m = readMarket(r.listings.filter((x) => x.shopId !== shop!.shopId), r.total, now);
        if (!m) continue;
        const alert = buildAlert(settings, {
          watchKey: `etsy:${l.id}`,
          title: l.title,
          ourPricePence: l.pricePence,
          medianPricePence: m.medianPricePence,
          lowPricePence: m.lowPricePence,
          basedOn: `live Etsy data for “${query}” (${r.total.toLocaleString()} listings)`,
          url: l.url,
          searchQuery: query,
        });
        if (alert && (await raiseAlert(db, alert))) raised++;
      }
      if (st.shopCursor >= mine.length) st.shopDone = true;
    }
  } else if (!etsy || !settings.radar.etsyShopName) {
    st.shopDone = true;
  }

  st.alerts += raised;
  await kvSet(db, "priceWatch", st);
  return raised;
}

/** Open Price Watch alerts, for the Listing Office badge. */
export async function openAlerts(db: DB) {
  return db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.kind, "price_watch"), inArray(tasks.state, ["needs_approval"])))
    .all();
}
