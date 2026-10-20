// 🛍️ Connect your Etsy shop, and send finished products to it as drafts.
import { eq } from "drizzle-orm";
import { z } from "zod";
import { newApp, body, HttpError, type Ctx } from "../app";
import { products } from "../db/schema";
import { vaultSecret } from "../lib/vault";
import { EtsyError } from "../providers/etsy";
import { callbackUrl, connectUrl, disconnect, ETSY_SCOPES, finishConnect, shopClient, shopInfo } from "../providers/etsyShop";
import { ordersList, ordersState, syncOrders } from "../engine/orders";
import { sendDraft } from "../engine/etsyPublish";

const origin = (c: Ctx) => new URL(c.req.url).origin;

async function apiKeyOrThrow(c: Ctx) {
  const key = await vaultSecret(c.get("db"), c.env, "etsy");
  if (!key) throw new HttpError(400, "Add your Etsy API key first (Settings → Etsy & Trend Radar).");
  return key;
}

const etsyErrors = (e: unknown): never => {
  if (e instanceof EtsyError) throw new HttpError(e.status >= 400 && e.status < 600 ? (e.status as 400) : 502, e.message);
  throw e;
};

export const etsyRoutes = newApp()
  .get("/etsy", async (c) => {
    const db = c.get("db");
    return c.json({
      apiKey: !!(await vaultSecret(db, c.env, "etsy")),
      shop: await shopInfo(db),
      callbackUrl: callbackUrl(origin(c)),
      scopes: ETSY_SCOPES,
    });
  })
  .post("/etsy/connect", async (c) => {
    const key = await apiKeyOrThrow(c);
    return c.json({ url: await connectUrl(c.get("db"), key, origin(c)) });
  })
  // Etsy sends you back here after you approve (or decline) on etsy.com.
  .get("/etsy/callback", async (c) => {
    const back = (q: string) => c.redirect(`/settings?${q}#etsy`);
    const error = c.req.query("error");
    if (error) return back(`etsy=error&reason=${encodeURIComponent(c.req.query("error_description") ?? error)}`);
    const code = c.req.query("code");
    const state = c.req.query("state");
    if (!code || !state) return back("etsy=error&reason=missing%20code");
    try {
      const key = await apiKeyOrThrow(c);
      const shop = await finishConnect(c.get("db"), c.env, key, origin(c), code, state);
      return back(`etsy=connected&shop=${encodeURIComponent(shop.shopName)}`);
    } catch (e) {
      return back(`etsy=error&reason=${encodeURIComponent(e instanceof Error ? e.message : "Couldn't connect")}`);
    }
  })
  .post("/etsy/disconnect", async (c) => {
    await disconnect(c.get("db"));
    return c.json({ ok: true });
  })
  // 🧾 Orders Desk: your recent Etsy orders, and "Check now".
  .get("/orders", async (c) => {
    const db = c.get("db");
    return c.json({ shop: await shopInfo(db), state: await ordersState(db), orders: await ordersList(db) });
  })
  .post("/orders/sync", async (c) => {
    const db = c.get("db");
    const key = await apiKeyOrThrow(c);
    const shop = await shopClient(db, c.env, key);
    if (!shop) throw new HttpError(400, "Connect your Etsy shop first (Settings → Your Etsy shop).");
    try {
      return c.json({ ok: true, added: await syncOrders(db, c.get("settings"), shop, { force: true }) });
    } catch (e) {
      return etsyErrors(e);
    }
  })
  // 🚀 Send a product to Etsy as a draft (you publish it on Etsy yourself).
  .post("/products/:id/etsy-draft", async (c) => {
    const b = await body(c, z.object({ again: z.boolean().optional() }));
    const db = c.get("db");
    const p = await db.select().from(products).where(eq(products.id, c.req.param("id"))).get();
    if (!p) throw new HttpError(404, "No such product");
    if (p.demo) throw new HttpError(400, "Demo products can't go to Etsy.");
    const key = await apiKeyOrThrow(c);
    try {
      return c.json({ ok: true, draft: await sendDraft(db, c.env, key, p, { again: b.again }) });
    } catch (e) {
      return etsyErrors(e);
    }
  });
