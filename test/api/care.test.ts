// Customer Care: Concierge drafts replies (never sends), saved replies, and shop reviews.
import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { getDb } from "../../src/worker/db";
import type { AiServices, JsonRequest } from "../../src/worker/providers/ai";
import { draftReply, draftReviewResponse, DEFAULT_TEMPLATES, syncReviews, cachedReviews } from "../../src/worker/engine/care";
import { kvSet } from "../../src/worker/lib/store";
import { setUpOwner } from "./helpers";

const testAi = (log: JsonRequest<unknown>[] = []): AiServices => ({
  async json<T>(req: JsonRequest<T>) {
    log.push(req as JsonRequest<unknown>);
    const keys = Object.keys((req.jsonSchema as { properties: Record<string, unknown> }).properties);
    const out = keys.includes("reply") ? { reply: "  Hello! Your files are in Purchases and reviews.  " } : { response: "Thank you so much for your kind words." };
    return req.schema.parse(out);
  },
  async image() {
    return "";
  },
});

describe("customer care", () => {
  it("drafts a reply using the product's facts and the shop's voice", async () => {
    const log: JsonRequest<unknown>[] = [];
    const reply = await draftReply(testAi(log), {
      message: "Can I use this in Google Sheets?",
      note: "Say yes, and how",
      product: { title: "Budget Planner Spreadsheet", format: "excel", description: "Monthly budget tabs." },
      voice: "Calm and kind",
      shopName: "Test Shop",
    });
    expect(reply).toBe("Hello! Your files are in Purchases and reviews.");
    expect(log[0].prompt).toContain("Google Sheets");
    expect(log[0].prompt).toContain("Budget Planner Spreadsheet");
    expect(log[0].prompt).toContain("Say yes, and how");
    expect(log[0].system).toContain("Calm and kind");
    // "Rewrite" asks again under a different key.
    await draftReply(testAi(log), { message: "Can I use this in Google Sheets?", note: "Say yes, and how", product: null, voice: "x", shopName: "y", attempt: 1 });
    expect(log[1].key).not.toBe(log[0].key);
    const resp = await draftReviewResponse(testAi(log), { rating: 2, review: "File wouldn't open", voice: "x", shopName: "y" });
    expect(resp).toMatch(/Thank you/);
    expect(log[2].prompt).toContain("message the shop");
  });

  it("reply route: needs real AI, and waits politely for Claude", async () => {
    const c = await setUpOwner();
    expect((await c.post("/api/care/reply", { message: "" })).status).toBe(400);
    const off = await c.post("/api/care/reply", { message: "Where is my download?" });
    expect(off.status).toBe(400);
    expect(off.data.error).toMatch(/real AI/);
    await c.put("/api/settings", { ai: { provider: "claude-code" } });
    const r = await c.post("/api/care/reply", { message: "Where is my download?" });
    expect(r.status).toBe(202);
    expect(r.data.pending).toBe(true);
  });

  it("saved replies: seeded, add, edit, delete", async () => {
    const c = await setUpOwner();
    let list = (await c.get("/api/care/templates")).data.templates;
    expect(list.length).toBe(DEFAULT_TEMPLATES.length);
    const add = await c.post("/api/care/templates", { title: "Thanks", body: "Thank you for your order!" });
    expect(add.status).toBe(200);
    const id = add.data.template.id;
    expect((await c.put(`/api/care/templates/${id}`, { title: "Thank you", body: "Thanks so much!" })).status).toBe(200);
    list = (await c.get("/api/care/templates")).data.templates;
    expect(list.find((t: any) => t.id === id)).toMatchObject({ title: "Thank you", body: "Thanks so much!" });
    expect((await c.post("/api/care/templates", { title: "", body: "x" })).status).toBe(400);
    expect((await c.del(`/api/care/templates/${id}`)).status).toBe(200);
    expect((await c.del(`/api/care/templates/${id}`)).status).toBe(404);
    list = (await c.get("/api/care/templates")).data.templates;
    expect(list.length).toBe(DEFAULT_TEMPLATES.length);
  });

  it("reviews: a friendly 'not connected' state without a shop", async () => {
    const c = await setUpOwner();
    const r = await c.get("/api/care/reviews");
    expect(r.status).toBe(200);
    expect(r.data).toMatchObject({ connected: false, reviews: [], needsReply: 0 });
    expect((await c.post("/api/care/reviews/sync")).status).toBe(400);
  });

  it("reviews: stores Etsy reviews, matches products and flags low ratings", async () => {
    const c = await setUpOwner();
    const db = getDb(env.DB);
    const shop = { shopId: 42, shopName: "TestShop", userId: "7", connectedAt: new Date().toISOString() };
    await kvSet(db, "etsyConnectedShop", shop);
    const now = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO products (id,title,niche,stage,seed,data,demo,created_at,updated_at) VALUES ('p1','Frog Print','frogs','live',1,?,0,?,?)`)
      .bind(JSON.stringify({ etsy: { listingId: 555 } }), now, now)
      .run();
    const fake = {
      shop: { ...shop },
      async reviews() {
        return {
          count: 2,
          results: [
            { shop_id: 42, listing_id: 555, transaction_id: 1, buyer_user_id: 9, rating: 2, review: "Wouldn't print", create_timestamp: 1_760_000_000 },
            { shop_id: 42, listing_id: 999, transaction_id: 2, buyer_user_id: 8, rating: 5, review: "Lovely", create_timestamp: 1_760_100_000 },
          ],
        };
      },
    };
    await syncReviews(db, fake as any);
    expect((await cachedReviews(db, 42)).reviews.length).toBe(2);
    let r = (await c.get("/api/care/reviews")).data;
    expect(r.connected).toBe(true);
    expect(r.needsReply).toBe(1);
    const low = r.reviews.find((x: any) => x.rating === 2);
    expect(low.product).toMatchObject({ id: "p1", title: "Frog Print" });
    expect(low.needsReply).toBe(true);
    expect(r.reviews.find((x: any) => x.rating === 5).product).toBeNull();
    await c.post(`/api/care/reviews/${low.key}/responded`, { responded: true });
    r = (await c.get("/api/care/reviews")).data;
    expect(r.needsReply).toBe(0);
    expect(r.reviews.find((x: any) => x.key === low.key).respondedAt).toBeTruthy();
  });
});
