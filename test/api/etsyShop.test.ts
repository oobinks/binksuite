// 🛍️ Connecting a real shop, sending drafts and reading orders, against a stand-in Etsy.
import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { getDb } from "../../src/worker/db";
import { getSettings, kvGet, kvSet } from "../../src/worker/lib/store";
import { connectUrl, finishConnect, findTaxonomy, shopClient, shopInfo, TAXONOMY_PATHS } from "../../src/worker/providers/etsyShop";
import { sendDraft } from "../../src/worker/engine/etsyPublish";
import { syncOrders, ordersList } from "../../src/worker/engine/orders";
import { setUpOwner } from "./helpers";

const KEY = "keystring123:secret";
const ORIGIN = "https://binksuite.test";

function fakeEtsy(log: { method: string; url: string; body?: unknown }[], refuseWhenMade: string[] = []) {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    let body: unknown = init?.body;
    if (typeof body === "string") body = body.startsWith("{") ? JSON.parse(body) : Object.fromEntries(new URLSearchParams(body));
    if (body instanceof URLSearchParams) body = Object.fromEntries(body);
    if (body instanceof FormData) body = Object.fromEntries([...body.entries()].map(([k, v]) => [k, typeof v === "string" ? v : `file:${(v as File).name}`]));
    log.push({ method, url, body });
    if (url.endsWith("/oauth/token")) return Response.json({ access_token: "4242.accesstoken", refresh_token: "refreshtoken", expires_in: 3600 });
    if (url.includes("/users/4242/shops")) return Response.json({ shop_id: 99, shop_name: "BinkSuite" });
    if (url.includes("/seller-taxonomy/nodes"))
      return Response.json({ results: [{ id: 1, name: "Paper & Party Supplies", children: [{ id: 2, name: "Paper", children: [{ id: 3, name: "Calendars & Planners" }] }] }] });
    if (url.endsWith("/shops/99/listings") && method === "POST") {
      const when = (body as Record<string, string>).when_made;
      if (refuseWhenMade.includes(when)) return Response.json({ error: `when_made must be one of: made_to_order, 2020_2025` }, { status: 400 });
      return Response.json({ listing_id: 555 });
    }
    if (url.includes("/listings/555/images") || url.includes("/listings/555/files")) return Response.json({ ok: true });
    if (url.includes("/shops/99/receipts"))
      return Response.json({
        count: 1,
        results: [
          {
            receipt_id: 7001,
            created_timestamp: Math.floor(Date.now() / 1000),
            is_paid: true,
            message_from_buyer: "Could it start on a Monday?",
            transactions: [{ transaction_id: 1, listing_id: 555, title: "Gift Tracker Spreadsheet", quantity: 1, price: { amount: 449, divisor: 100, currency_code: "GBP" } }],
          },
        ],
      });
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
}

describe("Etsy shop (publishing and orders)", () => {
  it("connects with PKCE, sends a draft with photos and files, and records new orders once", async () => {
    await setUpOwner();
    const db = getDb(env.DB);
    const settings = await getSettings(db);
    const log: { method: string; url: string; body?: unknown }[] = [];
    const fetcher = fakeEtsy(log);
    // Price Watch's own shop note must not look like a connection.
    await kvSet(db, "etsyShop", { name: "BinkSuite", shopId: 99 });
    expect(await shopInfo(db)).toBeNull();

    // 1. Connect: a proper PKCE link, then the code is swapped for tokens and the shop is found.
    const raw = await connectUrl(db, KEY, ORIGIN);
    expect(raw).toContain("scope=listings_r%20listings_w%20shops_r%20transactions_r");
    const link = new URL(raw);
    expect(link.origin + link.pathname).toBe("https://www.etsy.com/oauth/connect");
    expect(link.searchParams.get("client_id")).toBe("keystring123");
    expect(link.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/api/etsy/callback`);
    expect(link.searchParams.get("code_challenge_method")).toBe("S256");
    expect(link.searchParams.get("scope")).toContain("listings_w");
    const state = link.searchParams.get("state")!;
    const shop = await finishConnect(db, env as any, KEY, ORIGIN, "thecode", state, fetcher);
    expect(shop).toMatchObject({ shopId: 99, shopName: "BinkSuite", userId: "4242" });
    expect(log.find((l) => l.url.endsWith("/oauth/token"))!.body).toMatchObject({ grant_type: "authorization_code", code: "thecode", client_id: "keystring123" });
    // The same link can't be used twice.
    await expect(finishConnect(db, env as any, KEY, ORIGIN, "thecode", state, fetcher)).rejects.toThrow(/expired/);
    // Tokens are stored encrypted.
    expect((await env.DB.prepare("SELECT ciphertext FROM vault WHERE provider = 'etsy-oauth'").first<any>()).ciphertext).not.toMatch(/accesstoken/);

    // 2. A finished product goes to Etsy as a draft: words, price, photos in order, buyer files.
    await env.FILES.put("products/pe/photo1.jpg", new Uint8Array([1, 2, 3]));
    await env.FILES.put("products/pe/photo2.jpg", new Uint8Array([4, 5, 6]));
    await env.FILES.put("products/pe/file1.xlsx", new Uint8Array([7]));
    await env.FILES.put("products/pe/file2.pdf", new Uint8Array([8]));
    const now = new Date().toISOString();
    const data = {
      format: "excel",
      listing: { title: "Gift Tracker Spreadsheet | Christmas Budget", tags: ["gift tracker", "christmas budget"], description: "Designed with AI assistance." },
      keptImages: ["products/pe/photo1.jpg", "products/pe/photo2.jpg"],
      deliverables: [
        { key: "products/pe/file1.xlsx", name: "Gift Tracker.xlsx" },
        { key: "products/pe/file2.pdf", name: "Gift Tracker - Printable A4.pdf" },
      ],
    };
    await env.DB.prepare("INSERT INTO products (id,title,niche,stage,seed,price_pence,data,demo,created_at,updated_at) VALUES ('pe','Gift Tracker','gifts','launch',1,449,?,0,?,?)")
      .bind(JSON.stringify(data), now, now)
      .run();
    const product = await env.DB.prepare("SELECT * FROM products WHERE id = 'pe'").first<any>();
    const draft = await sendDraft(db, env as any, KEY, { ...product, pricePence: product.price_pence, data: JSON.parse(product.data), demo: false }, { fetcher });
    expect(draft).toMatchObject({ listingId: 555, photos: 2, files: ["Gift Tracker.xlsx", "Gift Tracker - Printable A4.pdf"], category: "Paper & Party Supplies › Paper › Calendars & Planners" });
    expect(draft.editUrl).toBe("https://www.etsy.com/your/shops/me/listing-editor/edit/555");
    const create = log.find((l) => l.url.endsWith("/shops/99/listings"))!;
    expect(create.body).toMatchObject({ title: data.listing.title, price: "4.49", type: "download", who_made: "i_did", when_made: `2020_${new Date().getUTCFullYear()}`, taxonomy_id: "3", quantity: "999", is_supply: "false", should_auto_renew: "false", tags: "gift tracker,christmas budget" });
    expect(log.filter((l) => l.url.includes("/images")).map((l) => (l.body as any).rank)).toEqual(["1", "2"]);
    expect(log.filter((l) => l.url.includes("/files")).map((l) => (l.body as any).name)).toEqual(["Gift Tracker.xlsx", "Gift Tracker - Printable A4.pdf"]);
    // Sending again returns the same draft unless you ask for a second one.
    const before = log.length;
    await sendDraft(db, env as any, KEY, { ...product, pricePence: product.price_pence, data: { ...JSON.parse(product.data), etsy: draft }, demo: false }, { fetcher });
    expect(log.length).toBe(before);

    // 3. Orders: a new paid order is recorded once, matched to the product, with the buyer's note.
    const client = (await shopClient(db, env as any, KEY, fetcher))!;
    expect(await syncOrders(db, settings, client, { force: true })).toBe(1);
    expect(await syncOrders(db, settings, client, { force: true })).toBe(0);
    const orders = await ordersList(db);
    expect(orders[0]).toMatchObject({ receiptId: 7001, totalPence: 449, note: "Could it start on a Monday?", items: [{ productId: "pe", pricePence: 449 }] });
    const sale = await env.DB.prepare("SELECT * FROM ledger WHERE kind = 'sale' AND product_id = 'pe'").all<any>();
    expect(sale.results).toHaveLength(1);
    expect(sale.results[0].amount_pence).toBe(449);
    expect(await kvGet(db, "etsyConnectedShop")).toMatchObject({ shopName: "BinkSuite" });
  });

  it("finds the right Etsy category for each kind of product", () => {
    const tree = [
      { id: 1, name: "Art & Collectibles", children: [{ id: 10, name: "Prints", children: [{ id: 11, name: "Digital Prints" }] }] },
      { id: 2, name: "Paper & Party Supplies", children: [{ id: 20, name: "Paper", children: [{ id: 21, name: "Calendars & Planners" }] }] },
    ];
    expect(findTaxonomy(tree, TAXONOMY_PATHS.art)?.id).toBe(11);
    expect(findTaxonomy(tree, TAXONOMY_PATHS.excel)?.id).toBe(21);
    expect(findTaxonomy(tree, TAXONOMY_PATHS.pdf)?.path).toBe("Paper & Party Supplies › Paper › Calendars & Planners");
  });

  it("marks drafts as made recently (an instant download), stepping back a year if Etsy hasn't moved its range on", async () => {
    await setUpOwner();
    const db = getDb(env.DB);
    const year = new Date().getUTCFullYear();
    const log: { method: string; url: string; body?: unknown }[] = [];
    const fetcher = fakeEtsy(log, [`2020_${year}`]);
    await kvSet(db, "etsyConnectedShop", { shopId: 99, shopName: "BinkSuite", userId: "4242", connectedAt: new Date().toISOString() });
    const { encryptSecret } = await import("../../src/worker/lib/crypto");
    const { ciphertext, iv } = await encryptSecret(JSON.stringify({ access: "4242.a", refresh: "r", expiresAt: Date.now() + 3600_000 }), (env as any).VAULT_MASTER_KEY);
    await env.DB.prepare("INSERT INTO vault (provider, ciphertext, iv, last4, updated_at) VALUES ('etsy-oauth', ?, ?, 'abcd', ?)").bind(ciphertext, iv, new Date().toISOString()).run();
    const shop = (await shopClient(db, env as any, KEY, fetcher))!;
    const r = await shop.createDraft({ title: "Budget Planner", description: "x", pricePence: 499, tags: ["budget"], taxonomyId: 3 });
    expect(r.listingId).toBe(555);
    const tries = log.filter((l) => l.url.endsWith("/shops/99/listings")).map((l) => (l.body as Record<string, string>).when_made);
    expect(tries).toEqual([`2020_${year}`, `2020_${year - 1}`]);
    expect(tries).not.toContain("made_to_order");
  });
});
