// Customer Care: Concierge drafts replies to buyers and to reviews. Nothing is ever sent:
// you copy each draft into Etsy yourself.
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { aiFor, body, HttpError, newApp, type Ctx } from "../app";
import { products } from "../db/schema";
import { vaultSecret } from "../lib/vault";
import { isAiLimit } from "../providers/ai";
import { isClaudePending } from "../providers/claudeCode";
import { EtsyError } from "../providers/etsy";
import { shopClient, shopInfo } from "../providers/etsyShop";
import { formatOf } from "../../shared/format";
import {
  cachedReviews,
  draftReply,
  draftReviewResponse,
  listTemplates,
  markResponded,
  needsReply,
  productFacts,
  respondedMap,
  saveTemplates,
  syncReviews,
} from "../engine/care";

const NO_AI = "Switch on real AI in Settings first.";

/** Runs a Concierge draft, turning Claude's "working on it" and AI limits into friendly answers. */
async function drafting<T extends object>(c: Ctx, run: () => Promise<T>) {
  try {
    return c.json({ pending: false, ...(await run()) });
  } catch (e) {
    if (isClaudePending(e)) return c.json({ pending: true }, 202);
    throw new HttpError(isAiLimit(e) ? 429 : 502, e instanceof Error ? e.message : "Concierge couldn't write that just now.");
  }
}

/** Your real (non-demo) products, keyed by Etsy listing id. */
async function realProducts(c: Ctx) {
  return c.get("db").select().from(products).where(eq(products.demo, false)).orderBy(desc(products.updatedAt)).all();
}

const listingIdOf = (data: unknown) => {
  const id = (data as { etsy?: { listingId?: unknown } } | null)?.etsy?.listingId;
  return typeof id === "number" ? id : typeof id === "string" && /^\d+$/.test(id) ? Number(id) : null;
};

const templateBody = z.object({ title: z.string().trim().min(1).max(80), body: z.string().trim().min(1).max(3000) });

export const careRoutes = newApp()
  // Products you can pick when drafting a reply.
  .get("/care/products", async (c) => {
    const rows = await realProducts(c);
    return c.json({ products: rows.map((p) => ({ id: p.id, title: productFacts(p).title, format: formatOf(p), stage: p.stage })) });
  })
  // ───── Reply drafter ─────
  .post("/care/reply", async (c) => {
    const b = await body(
      c,
      z.object({ message: z.string().trim().min(1, "Paste the buyer's message first.").max(4000), productId: z.string().max(80).nullish(), note: z.string().max(600).nullish(), attempt: z.number().int().min(0).max(50).optional() }),
    );
    const db = c.get("db");
    let product = null;
    if (b.productId) {
      const p = await db.select().from(products).where(and(eq(products.id, b.productId), eq(products.demo, false))).get();
      if (!p) throw new HttpError(404, "That product isn't in your shop any more.");
      product = productFacts(p);
    }
    const ai = aiFor(c);
    if (!ai) throw new HttpError(400, NO_AI);
    const s = c.get("settings");
    return drafting(c, async () => ({
      reply: await draftReply(ai, { message: b.message, note: b.note ?? undefined, product, voice: s.toneOfVoice, shopName: s.shopName, attempt: b.attempt ?? 0 }),
    }));
  })
  // ───── Saved replies ─────
  .get("/care/templates", async (c) => c.json({ templates: await listTemplates(c.get("db")) }))
  .post("/care/templates", async (c) => {
    const b = await body(c, templateBody);
    const db = c.get("db");
    const list = await listTemplates(db);
    if (list.length >= 100) throw new HttpError(400, "That's a lot of saved replies. Delete one first.");
    const t = { id: crypto.randomUUID(), title: b.title, body: b.body, updatedAt: new Date().toISOString() };
    await saveTemplates(db, [...list, t]);
    return c.json({ template: t });
  })
  .put("/care/templates/:id", async (c) => {
    const b = await body(c, templateBody);
    const db = c.get("db");
    const list = await listTemplates(db);
    const i = list.findIndex((t) => t.id === c.req.param("id"));
    if (i < 0) throw new HttpError(404, "No such saved reply");
    list[i] = { ...list[i], title: b.title, body: b.body, updatedAt: new Date().toISOString() };
    await saveTemplates(db, list);
    return c.json({ template: list[i] });
  })
  .delete("/care/templates/:id", async (c) => {
    const db = c.get("db");
    const list = await listTemplates(db);
    const next = list.filter((t) => t.id !== c.req.param("id"));
    if (next.length === list.length) throw new HttpError(404, "No such saved reply");
    await saveTemplates(db, next);
    return c.json({ ok: true });
  })
  // ───── Reviews ─────
  .get("/care/reviews", async (c) => {
    const db = c.get("db");
    const shop = await shopInfo(db);
    if (!shop) return c.json({ connected: false, shop: null, at: null, reviews: [], needsReply: 0 });
    const { at, reviews } = await cachedReviews(db, shop.shopId);
    const done = await respondedMap(db);
    const ids = [...new Set(reviews.map((r) => r.listingId))];
    const byListing = new Map<number, { id: string; title: string }>();
    if (ids.length)
      for (const p of await realProducts(c)) {
        const lid = listingIdOf(p.data);
        if (lid && ids.includes(lid)) byListing.set(lid, { id: p.id, title: productFacts(p).title });
      }
    const out = reviews.map((r) => {
      const responded = done[r.key] ?? null;
      return { ...r, product: byListing.get(r.listingId) ?? null, respondedAt: responded, needsReply: needsReply(r, !!responded) };
    });
    return c.json({ connected: true, shop: { shopName: shop.shopName }, at, reviews: out, needsReply: out.filter((r) => r.needsReply).length });
  })
  .post("/care/reviews/sync", async (c) => {
    const db = c.get("db");
    const key = await vaultSecret(db, c.env, "etsy");
    if (!key) throw new HttpError(400, "Add your Etsy API key first (Settings → Etsy & Trend Radar).");
    try {
      const shop = await shopClient(db, c.env, key);
      if (!shop) throw new HttpError(400, "Connect your Etsy shop first (Settings → Your Etsy shop).");
      const r = await syncReviews(db, shop);
      return c.json({ ok: true, count: r.reviews.length });
    } catch (e) {
      if (e instanceof EtsyError) throw new HttpError(e.status >= 400 && e.status < 500 ? e.status : 502, e.message);
      throw e;
    }
  })
  .post("/care/reviews/:key/responded", async (c) => {
    const b = await body(c, z.object({ responded: z.boolean() }));
    await markResponded(c.get("db"), c.req.param("key").slice(0, 120), b.responded);
    return c.json({ ok: true });
  })
  .post("/care/reviews/:key/draft", async (c) => {
    const b = await body(c, z.object({ attempt: z.number().int().min(0).max(50).optional() }));
    const db = c.get("db");
    const shop = await shopInfo(db);
    if (!shop) throw new HttpError(400, "Connect your Etsy shop first (Settings → Your Etsy shop).");
    const r = (await cachedReviews(db, shop.shopId)).reviews.find((x) => x.key === c.req.param("key"));
    if (!r) throw new HttpError(404, "That review isn't here any more. Check for new reviews.");
    let productTitle: string | null = null;
    for (const p of await realProducts(c))
      if (listingIdOf(p.data) === r.listingId) productTitle = productFacts(p).title;
    const ai = aiFor(c);
    if (!ai) throw new HttpError(400, NO_AI);
    const s = c.get("settings");
    return drafting(c, async () => ({
      response: await draftReviewResponse(ai, { rating: r.rating, review: r.review, productTitle, voice: s.toneOfVoice, shopName: s.shopName, attempt: b.attempt ?? 0 }),
    }));
  });
