// My shop: every listing you've sent to Etsy, how each is doing, and editing it from here.
// Saving changes a live listing on Etsy straight away, but only when you press Save.
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { newApp, body, HttpError, type Ctx } from "../app";
import { ledger, products } from "../db/schema";
import { vaultSecret } from "../lib/vault";
import { nowIso } from "../lib/store";
import { EtsyError } from "../providers/etsy";
import { shopClient, shopInfo } from "../providers/etsyShop";
import { listingPerformance } from "../engine/performance";
import { ordersList } from "../engine/orders";
import { cachedReviews } from "../engine/care";
import { logActivity } from "../engine/queue";
import { daysLeft, type EtsyLive } from "../engine/renewals";
import { blockedTermsIn, ETSY_LIMITS } from "../../shared/compliance";
import { formatOf } from "../../shared/format";

interface Data {
  etsy?: { listingId: number; editUrl?: string; url?: string };
  etsyLive?: EtsyLive;
  listing?: { title: string; tags: string[]; description: string };
  keptImages?: string[];
  launchedAt?: string;
}

async function shopOrThrow(c: Ctx) {
  const key = await vaultSecret(c.get("db"), c.env, "etsy");
  const shop = key ? await shopClient(c.get("db"), c.env, key) : null;
  if (!shop) throw new HttpError(400, "Connect your Etsy shop first (Settings → Your Etsy shop).");
  return shop;
}

const etsyErrors = (e: unknown): never => {
  if (e instanceof EtsyError) throw new HttpError(e.status >= 400 && e.status < 600 ? (e.status as 400) : 502, e.message);
  throw e;
};

async function sentProducts(c: Ctx) {
  return c
    .get("db")
    .select()
    .from(products)
    .where(and(eq(products.demo, false), sql`json_extract(${products.data}, '$.etsy.listingId') IS NOT NULL`))
    .all();
}

export const shopRoutes = newApp()
  .get("/shop/listings", async (c) => {
    const db = c.get("db");
    const [rows, perf] = await Promise.all([sentProducts(c), listingPerformance(db)]);
    const byId = new Map(perf.map((p) => [p.productId, p]));
    const listings = rows
      .map((p) => {
        const d = p.data as Data;
        const live = d.etsyLive;
        const f = byId.get(p.id);
        return {
          productId: p.id,
          listingId: d.etsy!.listingId,
          title: d.listing?.title ?? p.title,
          format: formatOf(p),
          pricePence: p.pricePence,
          cover: d.keptImages?.[0] ?? null,
          state: live?.state ?? "draft",
          daysLeft: live?.endsAt ? daysLeft(live.endsAt) : null,
          views: live?.views ?? 0,
          favourites: live?.favourites ?? 0,
          views30: f?.views30 ?? null,
          sales30: f?.sales30 ?? 0,
          salesTotal: f?.salesTotal ?? 0,
          verdict: f?.verdict ?? null,
          headline: f?.headline ?? null,
          url: live?.url ?? d.etsy?.url ?? null,
          checkedAt: live?.checkedAt ?? null,
        };
      })
      .sort((a, b) => (a.state === "active" ? 0 : 1) - (b.state === "active" ? 0 : 1) || a.title.localeCompare(b.title));
    return c.json({ connected: !!(await shopInfo(db)), listings });
  })
  .get("/shop/listings/:id", async (c) => {
    const db = c.get("db");
    const p = await db.select().from(products).where(eq(products.id, c.req.param("id"))).get();
    const d = p?.data as Data | undefined;
    if (!p || p.demo || !d?.etsy?.listingId) throw new HttpError(404, "That listing isn't in your shop.");
    const listingId = d.etsy.listingId;
    const [perf, orders, sales, info] = await Promise.all([
      listingPerformance(db),
      ordersList(db),
      db.select().from(ledger).where(and(eq(ledger.productId, p.id), eq(ledger.demo, false), eq(ledger.kind, "sale"))).all(),
      shopInfo(db),
    ]);
    const reviews = info ? (await cachedReviews(db, info.shopId)).reviews.filter((r) => r.listingId === listingId) : [];
    // What Etsy has right now (it may have been edited on Etsy). Fall back to BinkSuite's copy.
    let etsy: { title: string; description: string; tags: string[]; pricePence: number | null; state: string; url: string | null; images: string[]; imagesFull: string[] } | null = null;
    let etsyError: string | null = null;
    try {
      const shop = await shopOrThrow(c);
      const l = await shop.listingFull(listingId);
      etsy = {
        title: l.title,
        description: l.description,
        tags: l.tags ?? [],
        pricePence: l.price ? Math.round((l.price.amount / l.price.divisor) * 100) : null,
        state: l.state,
        url: l.url ?? null,
        images: (l.images ?? []).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0)).map((i) => i.url_570xN ?? i.url_fullxfull ?? "").filter(Boolean),
        // Full size, for the click-to-enlarge preview.
        imagesFull: (l.images ?? []).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0)).map((i) => i.url_fullxfull ?? i.url_570xN ?? "").filter(Boolean),
      };
    } catch (e) {
      etsyError = e instanceof Error ? e.message : "Couldn't reach Etsy.";
    }
    return c.json({
      productId: p.id,
      listingId,
      format: formatOf(p),
      title: etsy?.title ?? d.listing?.title ?? p.title,
      description: etsy?.description ?? d.listing?.description ?? "",
      tags: etsy?.tags ?? d.listing?.tags ?? [],
      pricePence: etsy?.pricePence ?? p.pricePence,
      state: etsy?.state ?? d.etsyLive?.state ?? "draft",
      url: etsy?.url ?? d.etsyLive?.url ?? null,
      editUrl: d.etsy.editUrl ?? `https://www.etsy.com/your/shops/me/listing-editor/edit/${listingId}`,
      images: etsy?.images.length ? etsy.images : [],
      imagesFull: etsy?.imagesFull ?? [],
      localImages: d.keptImages ?? [],
      endsAt: d.etsyLive?.endsAt ?? null,
      launchedAt: d.launchedAt ?? null,
      fromEtsy: !!etsy,
      etsyError,
      performance: perf.find((x) => x.productId === p.id) ?? null,
      orders: orders.filter((o) => o.items.some((i) => i.listingId === listingId)).map((o) => ({ ...o, items: o.items.filter((i) => i.listingId === listingId) })),
      revenuePence: sales.reduce((a, s) => a + s.amountPence, 0),
      salesCount: sales.length,
      reviews,
    });
  })
  .put("/shop/listings/:id", async (c) => {
    const db = c.get("db");
    const b = await body(
      c,
      z.object({
        title: z.string().trim().min(10).max(ETSY_LIMITS.titleMax),
        description: z.string().trim().min(20).max(20_000),
        tags: z.array(z.string().trim().min(1).max(ETSY_LIMITS.tagCharsMax)).max(ETSY_LIMITS.tagsMax),
        pricePence: z.number().int().min(20).max(100_000).optional(),
      }),
    );
    const p = await db.select().from(products).where(eq(products.id, c.req.param("id"))).get();
    const d = p?.data as Data | undefined;
    if (!p || p.demo || !d?.etsy?.listingId) throw new HttpError(404, "That listing isn't in your shop.");
    const blocked = blockedTermsIn([b.title, b.tags.join(" "), b.description].join("\n"), c.get("settings").blocklist);
    if (blocked.length) throw new HttpError(400, `Remove these protected words first: ${blocked.join(", ")}.`);
    const tags = [...new Set(b.tags.map((t) => t.toLowerCase()))];
    const shop = await shopOrThrow(c);
    try {
      await shop.updateListing(d.etsy.listingId, { title: b.title, description: b.description, tags });
      if (b.pricePence !== undefined && b.pricePence !== p.pricePence) await shop.setPrice(d.etsy.listingId, b.pricePence);
    } catch (e) {
      etsyErrors(e);
    }
    await db
      .update(products)
      .set({
        pricePence: b.pricePence ?? p.pricePence,
        data: { ...p.data, listing: { ...(d.listing ?? {}), title: b.title, description: b.description, tags } },
        updatedAt: nowIso(),
      })
      .where(eq(products.id, p.id));
    await logActivity(db, null, "launch", "finish", `Listing updated on Etsy: ${b.title.slice(0, 80)}`, false);
    return c.json({ ok: true });
  });
