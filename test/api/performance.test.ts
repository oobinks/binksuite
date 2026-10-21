// Listing performance: daily readings become 7/30-day views, next to real sales, with a verdict.
import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { getDb } from "../../src/worker/db";
import { judge, recordListingStats, performanceFacts, listingPerformance } from "../../src/worker/engine/performance";
import { setUpOwner } from "./helpers";

const DAY = 86_400_000;

async function addListing(id: string, title: string, live: { views: number; favourites: number; state?: string }, launchedDaysAgo: number, now: Date) {
  const data = {
    etsy: { listingId: Number(id.replace(/\D/g, "")) || 1, url: `https://www.etsy.com/listing/${id}` },
    etsyLive: { state: live.state ?? "active", endsAt: null, views: live.views, favourites: live.favourites, checkedAt: now.toISOString(), url: `https://www.etsy.com/listing/${id}` },
    launchedAt: new Date(now.getTime() - launchedDaysAgo * DAY).toISOString(),
  };
  await env.DB.prepare("INSERT INTO products (id, title, niche, stage, seed, data, demo, created_at, updated_at) VALUES (?, ?, ?, 'live', 1, ?, 0, ?, ?)")
    .bind(id, title, title, JSON.stringify(data), now.toISOString(), now.toISOString())
    .run();
}

async function sale(productId: string, daysAgo: number, now: Date) {
  const at = new Date(now.getTime() - daysAgo * DAY).toISOString();
  await env.DB.prepare("INSERT INTO ledger (id, date, kind, category, description, amount_pence, product_id, demo, created_at) VALUES (?, ?, 'sale', 'Etsy sale', 'x', 499, ?, 0, ?)")
    .bind(`l_${productId}_${daysAgo}`, at, productId, at)
    .run();
}

describe("listing performance", () => {
  it("gives each listing a plain verdict", () => {
    const base = { state: "active", daysLive: 40, views: 300, favourites: 10, views30: 120, favs30: 4, sales30: 0, salesTotal: 0 };
    expect(judge({ ...base, daysLive: 3, views: 5, views30: 5 }).verdict).toBe("new");
    expect(judge({ ...base, views30: 8 }).verdict).toBe("hidden");
    expect(judge({ ...base }).verdict).toBe("browsed");
    expect(judge({ ...base, favs30: 9 }).verdict).toBe("liked");
    expect(judge({ ...base, sales30: 1, salesTotal: 1 }).verdict).toBe("steady");
    expect(judge({ ...base, sales30: 3, salesTotal: 6 }).verdict).toBe("star");
    expect(judge({ ...base, state: "inactive" }).verdict).toBe("off");
    expect(judge({ ...base, sales30: 1, salesTotal: 1 }).room).toBe("mockups");
    expect(judge({ ...base, views30: 8 }).room).toBe("listing");
  });

  it("works out views over 7 and 30 days from daily readings, next to real sales", async () => {
    const c = await setUpOwner();
    const db = getDb(env.DB);
    const now = new Date("2026-10-21T12:00:00Z");
    await addListing("p1", "Budget Planner Spreadsheet", { views: 400, favourites: 30 }, 60, now);
    await addListing("p2", "Frog Print", { views: 12, favourites: 1 }, 50, now);
    // Daily readings for p1: 100 views 40 days ago, 250 thirty days ago, 360 a week ago, 400 today.
    for (const [ago, views, favs] of [[40, 100, 5], [30, 250, 18], [7, 360, 26], [0, 400, 30]] as const)
      await recordListingStats(db, "p1", { views, favourites: favs }, new Date(now.getTime() - ago * DAY));
    await recordListingStats(db, "p2", { views: 10, favourites: 1 }, new Date(now.getTime() - 31 * DAY));
    await recordListingStats(db, "p2", { views: 12, favourites: 1 }, now);
    await sale("p1", 3, now);
    await sale("p1", 10, now);
    await sale("p1", 45, now);

    const list = await listingPerformance(db, now);
    const p1 = list.find((l) => l.productId === "p1")!;
    expect(p1.views30).toBe(150);
    expect(p1.views7).toBe(40);
    expect(p1.favs30).toBe(12);
    expect(p1.sales30).toBe(2);
    expect(p1.salesTotal).toBe(3);
    expect(p1.verdict).toBe("star");
    expect(p1.daily).toHaveLength(30);
    expect(list.find((l) => l.productId === "p2")!.verdict).toBe("hidden");
    // Needs-help listings come first.
    expect(list[0].productId).toBe("p2");
    expect(performanceFacts(list)).toMatch(/Selling well: 1; .*hardly seen: 1/);

    const api = await c.get("/api/strategy/performance");
    expect(api.status).toBe(200);
    expect(api.data.listings).toHaveLength(2);
    // Manager's report gets the same facts.
    expect((await c.get("/api/strategy/numbers")).data.listingFacts).toMatch(/Budget Planner Spreadsheet/);
  });

  it("keeps one reading a day", async () => {
    await setUpOwner();
    const db = getDb(env.DB);
    const now = new Date("2026-10-21T08:00:00Z");
    await recordListingStats(db, "p9", { views: 5, favourites: 0 }, now);
    await recordListingStats(db, "p9", { views: 9, favourites: 1 }, new Date(now.getTime() + 6 * 3600_000));
    const row = await env.DB.prepare("SELECT value FROM kv WHERE key = 'listingStats'").first<{ value: string }>();
    expect(JSON.parse(row!.value).p9).toEqual([{ d: "2026-10-21", views: 9, favs: 1 }]);
  });
});
