// Shop analytics: whole-shop numbers for a period against the one before. Real data only.
import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { getDb } from "../../src/worker/db";
import { kvSet } from "../../src/worker/lib/store";
import { shopAnalytics } from "../../src/worker/engine/analytics";
import { setUpOwner } from "./helpers";

const NOW = new Date("2026-10-21T12:00:00Z");
const ago = (d: number, hourUtc = 12) => new Date(Date.UTC(2026, 9, 21 - d, hourUtc)).toISOString();

async function ledger(id: string, date: string, kind: string, pence: number, productId: string | null, demo = 0) {
  await env.DB.prepare("INSERT INTO ledger (id, date, kind, category, description, amount_pence, product_id, demo, created_at) VALUES (?, ?, ?, 'x', 'x', ?, ?, ?, ?)")
    .bind(id, date, kind, pence, productId, demo, date)
    .run();
}

describe("shop analytics", () => {
  it("adds up money, sales, views and patterns for the period and the one before", async () => {
    const c = await setUpOwner();
    const db = getDb(env.DB);
    const data = (format: string, listingId: number) => JSON.stringify({ format, etsy: { listingId }, etsyLive: { state: "active", views: 300, favourites: 20, checkedAt: NOW.toISOString() }, launchedAt: ago(60) });
    for (const [id, title, format, lid] of [["pa", "Budget Planner", "excel", 11], ["pb", "Meal Planner", "pdf", 22]] as const)
      await env.DB.prepare("INSERT INTO products (id, title, niche, stage, seed, price_pence, data, demo, created_at, updated_at) VALUES (?, ?, 'x', 'live', 1, 499, ?, 0, ?, ?)")
        .bind(id, title, data(format, lid), ago(60), ago(0))
        .run();
    // This period (last 30 days): 3 sales (2 spreadsheet, 1 PDF), fees and an AI cost.
    await ledger("s1", ago(1, 19), "sale", 499, "pa"); // Tue 20 Oct, 20:00 UK (BST)
    await ledger("s2", ago(2, 19), "sale", 999, "pa"); // Mon 19 Oct, 20:00 UK
    await ledger("s3", ago(8, 8), "sale", 299, "pb"); //  Tue 13 Oct, 09:00 UK
    await ledger("f1", ago(1, 19), "fee", -100, "pa");
    await ledger("c1", ago(3), "api", -5, null);
    // The 30 days before: 1 sale. And a demo sale that must be ignored.
    await ledger("s4", ago(40), "sale", 499, "pa");
    await ledger("d1", ago(1), "sale", 5000, null, 1);
    await kvSet(db, "etsyOrders", [{ receiptId: 1, at: ago(1, 19), totalPence: 499, note: null, items: [] }, { receiptId: 2, at: ago(40), totalPence: 499, note: null, items: [] }]);
    // Daily readings for pa: 100 views 31 days ago, 190 ten days ago, 250 today.
    await kvSet(db, "listingStats", { pa: [{ d: ago(31).slice(0, 10), views: 100, favs: 5 }, { d: ago(10).slice(0, 10), views: 190, favs: 9 }, { d: ago(0).slice(0, 10), views: 250, favs: 12 }] });
    await kvSet(db, "careReviews", { shopId: 1, at: ago(0), reviews: [{ key: "a", rating: 5, at: ago(2) }, { key: "b", rating: 4, at: ago(3) }, { key: "c", rating: 2, at: ago(4) }] });

    const a = await shopAnalytics(db, 30, { now: NOW });
    expect(a.now).toMatchObject({ revenuePence: 1797, feesPence: 100, costsPence: 5, netPence: 1692, sales: 3, orders: 1 });
    expect(a.before).toMatchObject({ revenuePence: 499, sales: 1, orders: 1 });
    // 90 views over the 21 days between readings, spread evenly (20 of those days are in the window), then 60.
    expect(a.now.views).toBe(146);
    expect(a.now.favourites).toBe(7);
    expect(a.daily).toHaveLength(30);
    expect(a.daily.reduce((s, d) => s + d.sales, 0)).toBe(3);
    expect(a.byFormat).toEqual([{ format: "excel", sales: 2, revenuePence: 1498 }, { format: "pdf", sales: 1, revenuePence: 299 }]);
    expect(a.byWeekday.find((w) => w.day === "Tue")!.sales).toBe(2);
    expect(a.byWeekday.find((w) => w.day === "Mon")!.sales).toBe(1);
    expect(a.byHour[20].sales).toBe(2);
    expect(a.byHour[9].sales).toBe(1);
    expect(a.byPrice.find((p) => p.band === "£8–£11.99")!.sales).toBe(1);
    expect(a.topListings[0]).toMatchObject({ productId: "pa", revenuePence: 1498, sales: 2 });
    expect(a.reviews).toEqual({ count: 3, average: 3.7, stars: [0, 1, 0, 1, 1] });

    const api = await c.get("/api/shop/analytics?days=7");
    expect(api.status).toBe(200);
    expect(api.data.days).toBe(7);
    expect(api.data.daily).toHaveLength(7);
  });
});
