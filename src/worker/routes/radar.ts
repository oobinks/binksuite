// 📡 Trend Radar, 🎯 today's ideas and 👀 Price Watch.
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { newApp, body, HttpError, aiFor, type Ctx } from "../app";
import { trendNiches } from "../db/schema";
import { kvGet } from "../lib/store";
import { vaultSecret } from "../lib/vault";
import { etsyClient } from "../providers/etsy";
import { isAiLimit } from "../providers/ai";
import { isClaudePending } from "../providers/claudeCode";
import { liveOnly, makeDailyIdeas, marketOf, nicheFormat, radarTick, scanNiche, watchNiche, ensureSeeds, type DailyIdeas } from "../engine/trends";
import { priceWatchTick } from "../engine/priceWatch";
import { listSuggestions, suggestIdea } from "../engine/queue";

export async function etsyFor(c: Ctx) {
  const key = await vaultSecret(c.get("db"), c.env, "etsy");
  return key ? etsyClient(key, c.get("settings").fees.usdToGbp) : null;
}

export const radarRoutes = newApp()
  .get("/radar", async (c) => {
    const db = c.get("db");
    await ensureSeeds(db);
    const day = new Date().toISOString().slice(0, 10);
    const live = await liveOnly(db);
    const [niches, daily, error, etsy, suggestions] = await Promise.all([
      db.select().from(trendNiches).where(and(sql`${trendNiches.score} > 0`, live)).orderBy(desc(trendNiches.score)).limit(20).all(),
      kvGet<DailyIdeas>(db, `daily:${day}`),
      kvGet<{ at: string; message: string } | null>(db, "radarError"),
      etsyFor(c),
      listSuggestions(db, true),
    ]);
    const watched = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(trendNiches).get();
    const scanned = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(trendNiches).where(eq(trendNiches.source, "etsy")).get();
    const stages = new Map(suggestions.map((s) => [s.productId, s]));
    return c.json({
      etsyConnected: !!etsy,
      aiReady: !!aiFor(c),
      error,
      watching: watched?.n ?? 0,
      scannedLive: scanned?.n ?? 0,
      niches: niches.map((n) => ({ ...n, format: nicheFormat(n.keyword, n.category) })),
      daily: daily
        ? { ...daily, items: daily.items.map((i) => ({ ...i, stage: stages.get(i.productId)?.stage ?? "research", verdict: stages.get(i.productId)?.verdict ?? null, overall: stages.get(i.productId)?.overall ?? null })) }
        : null,
      settings: c.get("settings").radar,
    });
  })
  .post("/radar/scan", async (c) => {
    // "Scan now": read a few more niches straight away.
    const r = await radarTick(c.get("db"), { ...c.get("settings"), radar: { ...c.get("settings").radar, autoDaily: false } }, { etsy: await etsyFor(c), ai: aiFor(c), budget: 8 });
    return c.json(r);
  })
  .post("/radar/daily", async (c) => {
    // "Give me today's ideas now" (doesn't wait for the morning run).
    const ai = aiFor(c);
    if (!ai) throw new HttpError(400, "Switch on real AI in Settings first.");
    try {
      const items = await makeDailyIdeas(c.get("db"), c.get("settings"), ai);
      if (!items.length) throw new HttpError(400, "No scored niches yet. Tap “Scan now” first.");
      return c.json({ ok: true, items });
    } catch (e) {
      if (e instanceof HttpError) throw e;
      if (isClaudePending(e)) return c.json({ ok: true, pending: true, items: [] }, 202);
      throw new HttpError(isAiLimit(e) ? 429 : 502, e instanceof Error ? e.message : "Couldn't make ideas just now.");
    }
  })
  .post("/radar/niches", async (c) => {
    const b = await body(c, z.object({ keyword: z.string().min(3).max(60) }));
    const db = c.get("db");
    const keyword = await watchNiche(db, b.keyword);
    const etsy = await etsyFor(c);
    if (etsy) await scanNiche(db, etsy, keyword).catch(() => null);
    return c.json({ ok: true, keyword });
  })
  .delete("/radar/niches/:keyword", async (c) => {
    await c.get("db").delete(trendNiches).where(eq(trendNiches.keyword, decodeURIComponent(c.req.param("keyword"))));
    return c.json({ ok: true });
  })
  .post("/radar/research", async (c) => {
    // Send a trending niche straight to Scout, with its market data attached.
    const b = await body(c, z.object({ keyword: z.string().min(1).max(60), idea: z.string().max(120).optional() }));
    const db = c.get("db");
    const n = await db.select().from(trendNiches).where(eq(trendNiches.keyword, b.keyword)).get();
    if (!n) throw new HttpError(404, "That niche isn't on the radar.");
    const p = await suggestIdea(db, c.get("settings"), b.idea?.trim() || n.keyword, `From Trend Radar: ${n.keyword}`, !!aiFor(c), {
      market: n.source === "etsy" ? marketOf(n) : null,
      trendKeyword: n.keyword,
      origin: "radar",
      format: nicheFormat(n.keyword, n.category),
    });
    await db.update(trendNiches).set({ lastSuggested: new Date().toISOString() }).where(eq(trendNiches.keyword, n.keyword));
    return c.json({ ok: true, productId: p.id });
  })
  .get("/radar/test", async (c) => {
    const etsy = await etsyFor(c);
    if (!etsy) return c.json({ ok: false, message: "No Etsy key saved yet." });
    try {
      const r = await etsy.search("printable wall art", "created", 3);
      const shopName = c.get("settings").radar.etsyShopName;
      const shop = shopName ? await etsy.findShop(shopName) : null;
      return c.json({
        ok: true,
        message: `Connected ✓ Etsy has ${r.total.toLocaleString()} “printable wall art” listings.${shopName ? (shop ? ` Found your shop “${shop.name}”.` : ` Couldn't find a shop called “${shopName}”.`) : ""}`,
      });
    } catch (e) {
      return c.json({ ok: false, message: e instanceof Error ? e.message : "Couldn't reach Etsy." });
    }
  })
  .post("/radar/price-watch", async (c) => {
    // "Run now" always does a fresh check, even if today's automatic one already ran.
    const raised = await priceWatchTick(c.get("db"), c.get("settings"), await etsyFor(c), new Date(), 10, true);
    return c.json({ ok: true, raised });
  });
