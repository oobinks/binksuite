// ⏳ Countdown to expiry and the keep-or-retire review, against a stand-in shop.
import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { getDb } from "../../src/worker/db";
import { getSettings } from "../../src/worker/lib/store";
import { recordSale } from "../../src/worker/engine/queue";
import { renewalTick, renewalVerdict } from "../../src/worker/engine/renewals";
import { setUpOwner } from "./helpers";

const DAY = 86_400_000;

describe("renewals", () => {
  it("tracks expiry, asks a week before, once, and retires expired listings", async () => {
    await setUpOwner();
    const db = getDb(env.DB);
    const settings = await getSettings(db);
    const now = new Date();
    let state = "active";
    let ends = Math.floor((now.getTime() + 5 * DAY) / 1000);
    const shop = { listing: async (id: number) => ({ listing_id: id, state, ending_timestamp: ends, views: 210, num_favorers: 9, url: `https://www.etsy.com/listing/${id}` }) } as any;
    const t = now.toISOString();
    const data = { etsy: { listingId: 555, editUrl: "x", at: t, photos: 1, files: [], category: "c" }, launchedAt: new Date(now.getTime() - 115 * DAY).toISOString() };
    await env.DB.prepare("INSERT INTO products (id,title,niche,stage,seed,price_pence,data,demo,created_at,updated_at) VALUES ('pr','Gift Tracker','gifts','launch',1,449,?,0,?,?)").bind(JSON.stringify(data), t, t).run();
    await recordSale(db, settings, { pricePence: 449, description: "Gift Tracker", productId: "pr", demo: false, date: t });

    expect(await renewalTick(db, shop, { now, force: true })).toMatchObject({ checked: 1, reviews: 1 });
    const p = await env.DB.prepare("SELECT stage, data FROM products WHERE id = 'pr'").first<any>();
    expect(p.stage).toBe("live"); // published on Etsy → live here
    expect(JSON.parse(p.data).etsyLive).toMatchObject({ state: "active", views: 210, favourites: 9 });
    const task = await env.DB.prepare("SELECT * FROM tasks WHERE kind = 'renewal_review'").first<any>();
    expect(task.state).toBe("needs_approval");
    expect(JSON.parse(task.output)).toMatchObject({ daysLeft: 5, sales: 1, revenuePence: 449, verdict: "keep", daysLive: 115 });
    // Not asked twice for the same expiry date…
    expect((await renewalTick(db, shop, { now, force: true })).reviews).toBe(0);
    // …and not checked again within 6 hours unless asked.
    expect((await renewalTick(db, shop, { now })).checked).toBe(0);
    // Renewed on Etsy: a new date far away, no new review.
    ends = Math.floor((now.getTime() + 120 * DAY) / 1000);
    expect((await renewalTick(db, shop, { now, force: true })).reviews).toBe(0);
    // Let go: Etsy says expired → the product is marked expired.
    state = "expired";
    await renewalTick(db, shop, { now, force: true });
    expect((await env.DB.prepare("SELECT stage FROM products WHERE id = 'pr'").first<any>()).stage).toBe("expired");
  });

  it("recommends keeping sellers, refreshing interest and retiring duds", () => {
    expect(renewalVerdict({ sales: 2, views: 10, favourites: 0, daysLive: 120 }).verdict).toBe("keep");
    expect(renewalVerdict({ sales: 0, views: 300, favourites: 2, daysLive: 120 }).verdict).toBe("maybe");
    expect(renewalVerdict({ sales: 0, views: 20, favourites: 1, daysLive: 120 }).verdict).toBe("retire");
  });

  it("brings in changes made on Etsy (title, price, tags, description) and says what changed", async () => {
    const c = await setUpOwner();
    const db = getDb(env.DB);
    const now = new Date();
    const t = now.toISOString();
    const listing = { title: "Trip Budget Planner | Travel Spreadsheet", tags: ["trip budget", "travel planner"], description: "A travel budget spreadsheet." };
    const data = { etsy: { listingId: 777, editUrl: "x", at: t, photos: 1, files: [], category: "c" }, listing, etsyLive: { state: "active", endsAt: null, views: 1, favourites: 0, checkedAt: t } };
    await env.DB.prepare("INSERT INTO products (id,title,niche,stage,seed,price_pence,data,demo,created_at,updated_at) VALUES ('pt','Trip Budget Planner','travel','live',1,539,?,0,?,?)").bind(JSON.stringify(data), t, t).run();
    let etsy = { ...listing, price: { amount: 539, divisor: 100, currency_code: "GBP" } };
    const shop = {
      listing: async () => {
        throw new Error("should use the full listing");
      },
      listingFull: async (id: number) => ({ listing_id: id, state: "active", ending_timestamp: Math.floor((now.getTime() + 90 * DAY) / 1000), views: 50, num_favorers: 3, url: "u", ...etsy }),
    } as any;

    // Nothing changed on Etsy.
    expect((await renewalTick(db, shop, { now, force: true })).changed).toEqual([]);

    // You edited the title, price and tags on Etsy.
    etsy = { ...etsy, title: "Holiday Budget Planner | Travel Spreadsheet", tags: ["holiday budget", "travel planner"], price: { amount: 449, divisor: 100, currency_code: "GBP" } };
    const r = await renewalTick(db, shop, { now, force: true });
    expect(r.changed).toHaveLength(1);
    expect(r.changed[0]).toMatchObject({ productId: "pt", title: "Holiday Budget Planner", fields: ["title", "tags", "price"] });
    const row = await env.DB.prepare("SELECT price_pence, data FROM products WHERE id = 'pt'").first<any>();
    expect(row.price_pence).toBe(449);
    expect(JSON.parse(row.data).listing).toMatchObject({ title: etsy.title, tags: etsy.tags, description: listing.description });

    // My shop shows what changed.
    const shopList = (await c.get("/api/shop/listings")).data.listings;
    expect(shopList.find((l: any) => l.productId === "pt").etsyChange.fields).toEqual(["title", "tags", "price"]);

    // Checking again finds nothing new.
    expect((await renewalTick(db, shop, { now, force: true })).changed).toEqual([]);
  });
});
