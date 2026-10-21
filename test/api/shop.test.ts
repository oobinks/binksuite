// My shop: the list of listings sent to Etsy, one listing's details, and saving edits to Etsy.
import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { getDb } from "../../src/worker/db";
import { kvSet } from "../../src/worker/lib/store";
import { encryptSecret } from "../../src/worker/lib/crypto";
import { shopClient } from "../../src/worker/providers/etsyShop";
import { setUpOwner } from "./helpers";

async function addSent(id: string, listingId: number, state = "active") {
  const now = new Date().toISOString();
  const data = {
    format: "excel",
    etsy: { listingId, editUrl: `https://www.etsy.com/your/shops/me/listing-editor/edit/${listingId}` },
    etsyLive: { state, endsAt: new Date(Date.now() + 40 * 86_400_000).toISOString(), views: 120, favourites: 9, checkedAt: now, url: `https://www.etsy.com/listing/${listingId}` },
    listing: { title: "Trip Budget Planner | Travel Spreadsheet", tags: ["trip budget"], description: "A travel budget spreadsheet designed with AI assistance." },
    keptImages: [`products/${id}/photo.jpg`],
    launchedAt: new Date(Date.now() - 30 * 86_400_000).toISOString(),
  };
  await env.DB.prepare("INSERT INTO products (id, title, niche, stage, seed, price_pence, data, demo, created_at, updated_at) VALUES (?, 'Trip Budget Planner', 'travel', 'live', 1, 539, ?, 0, ?, ?)")
    .bind(id, JSON.stringify(data), now, now)
    .run();
}

describe("my shop", () => {
  it("lists sent listings and shows one, falling back to BinkSuite's copy without Etsy", async () => {
    const c = await setUpOwner();
    await addSent("ps1", 777);
    await env.DB.prepare("INSERT INTO ledger (id, date, kind, category, description, amount_pence, product_id, demo, created_at) VALUES ('s1', ?, 'sale', 'Etsy sale', 'x', 539, 'ps1', 0, ?)")
      .bind(new Date().toISOString(), new Date().toISOString())
      .run();
    await kvSet(getDb(env.DB), "etsyOrders", [{ receiptId: 1, at: new Date().toISOString(), totalPence: 539, note: null, items: [{ title: "Trip", listingId: 777, productId: "ps1", quantity: 1, pricePence: 539 }] }, { receiptId: 2, at: new Date().toISOString(), totalPence: 100, note: null, items: [{ title: "Other", listingId: 1, productId: null, quantity: 1, pricePence: 100 }] }]);

    expect((await c.get("/api/state")).data.liveProducts).toBe(1);
    const list = (await c.get("/api/shop/listings")).data;
    expect(list.connected).toBe(false);
    expect(list.listings).toHaveLength(1);
    expect(list.listings[0]).toMatchObject({ productId: "ps1", listingId: 777, state: "active", views: 120, favourites: 9, salesTotal: 1, pricePence: 539 });

    const one = (await c.get("/api/shop/listings/ps1")).data;
    expect(one.fromEtsy).toBe(false);
    expect(one.etsyError).toMatch(/Connect your Etsy shop/);
    expect(one.title).toBe("Trip Budget Planner | Travel Spreadsheet");
    expect(one.orders.map((o: any) => o.receiptId)).toEqual([1]);
    expect(one.revenuePence).toBe(539);
    expect((await c.get("/api/shop/listings/nope")).status).toBe(404);
  });

  it("checks edits before they go to Etsy", async () => {
    const c = await setUpOwner();
    await addSent("ps2", 778);
    const ok = { title: "Trip Budget Planner | Travel Spreadsheet", description: "A travel budget spreadsheet for trips.", tags: ["trip budget"] };
    expect((await c.put("/api/shop/listings/ps2", { ...ok, title: "x".repeat(141) })).status).toBe(400);
    expect((await c.put("/api/shop/listings/ps2", { ...ok, tags: ["a tag that is far too long"] })).status).toBe(400);
    const blocked = await c.put("/api/shop/listings/ps2", { ...ok, title: "Disney Trip Budget Planner Spreadsheet" });
    expect(blocked.status).toBe(400);
    expect(blocked.data.error).toMatch(/disney/i);
    // Valid, but no shop connected.
    expect((await c.put("/api/shop/listings/ps2", ok)).data.error).toMatch(/Connect your Etsy shop/);
  });

  it("saves words with PATCH and the price through the listing's inventory", async () => {
    await setUpOwner();
    const db = getDb(env.DB);
    await kvSet(db, "etsyConnectedShop", { shopId: 99, shopName: "BinkSuite", userId: "4242", connectedAt: new Date().toISOString() });
    const { ciphertext, iv } = await encryptSecret(JSON.stringify({ access: "4242.a", refresh: "r", expiresAt: Date.now() + 3600_000 }), (env as any).VAULT_MASTER_KEY);
    await env.DB.prepare("INSERT INTO vault (provider, ciphertext, iv, last4, updated_at) VALUES ('etsy-oauth', ?, ?, 'abcd', ?)").bind(ciphertext, iv, new Date().toISOString()).run();
    const log: { method: string; url: string; body: any; type: string | null }[] = [];
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const type = (init?.headers as Record<string, string>)?.["content-type"] ?? null;
      const raw = init?.body;
      const body = typeof raw === "string" ? (raw.startsWith("{") ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw))) : raw instanceof URLSearchParams ? Object.fromEntries(raw) : raw;
      log.push({ method, url, body, type });
      if (url.endsWith("/listings/777/inventory") && method === "GET")
        return Response.json({ products: [{ product_id: 1, sku: "", is_deleted: false, property_values: [], offerings: [{ offering_id: 5, price: { amount: 539, divisor: 100 }, quantity: 999, is_enabled: true, is_deleted: false }] }], price_on_property: [], quantity_on_property: [], sku_on_property: [] });
      return Response.json({ ok: true });
    }) as typeof fetch;
    const shop = (await shopClient(db, env as any, "keystring123:secret", fetcher))!;
    await shop.updateListing(777, { title: "New title here", description: "New description", tags: ["trip budget", "travel, planner"] });
    await shop.setPrice(777, 499);
    const patch = log.find((l) => l.method === "PATCH")!;
    expect(patch.url).toMatch(/\/shops\/99\/listings\/777$/);
    expect(patch.body).toEqual({ title: "New title here", description: "New description", tags: "trip budget,travel  planner" });
    const put = log.find((l) => l.method === "PUT")!;
    expect(put.url).toMatch(/\/listings\/777\/inventory$/);
    expect(put.type).toBe("application/json");
    expect(put.body).toEqual({ products: [{ sku: "", property_values: [], offerings: [{ price: 4.99, quantity: 999, is_enabled: true }] }], price_on_property: [], quantity_on_property: [], sku_on_property: [] });
  });
});
