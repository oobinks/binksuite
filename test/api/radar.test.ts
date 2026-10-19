import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { getDb } from "../../src/worker/db";
import { getSettings, kvGet } from "../../src/worker/lib/store";
import { radarTick, makeDailyIdeas, SEED_NICHES } from "../../src/worker/engine/trends";
import { priceWatchTick } from "../../src/worker/engine/priceWatch";
import { approveTask, rejectTask, tick } from "../../src/worker/engine/queue";
import { etsyClient } from "../../src/worker/providers/etsy";
import type { AiServices, JsonRequest } from "../../src/worker/providers/ai";
import { setUpOwner } from "./helpers";

const now = new Date("2026-10-16T09:00:00Z");
const ago = (d: number) => Math.floor((now.getTime() - d * 86_400_000) / 1000);

/** A pretend Etsy API: "mushroom" niches are hot, everything else is quiet. */
function fakeFetch(calls: string[]): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    calls.push(url.pathname + url.search);
    if (url.pathname.endsWith("/shops")) return Response.json({ results: [{ shop_id: 77, shop_name: "CosyShop" }] });
    if (url.pathname.endsWith("/shops/77/listings/active"))
      return Response.json({ results: [{ listing_id: 1, title: "Mushroom wall art print", price: { amount: 899, divisor: 100, currency_code: "GBP" }, num_favorers: 3, original_creation_timestamp: ago(40), shop_id: 77, tags: ["mushroom wall art"], url: "https://etsy.com/listing/1" }] });
    const kw = url.searchParams.get("keywords") ?? "";
    const hot = kw.includes("mushroom");
    const results = Array.from({ length: 20 }, (_, i) => ({
      listing_id: 100 + i,
      title: `${kw} ${i}`,
      price: { amount: 300 + i * 20, divisor: 100, currency_code: i % 5 === 0 ? "USD" : "GBP" },
      num_favorers: hot ? 60 : 1,
      original_creation_timestamp: ago(10 + i),
      shop_id: 500 + i,
      tags: [kw],
    }));
    return Response.json({ count: hot ? 4000 : 90000, results });
  }) as typeof fetch;
}

const fakeAi = (): AiServices => ({
  async json<T>(req: JsonRequest<T>): Promise<T> {
    const keys = Object.keys((req.jsonSchema as { properties: object }).properties);
    if (keys.includes("ideas")) {
      const kws = [...req.prompt.matchAll(/^- ([^:]+):/gm)].map((m) => m[1]);
      return req.schema.parse({ ideas: kws.map((k) => ({ keyword: k, idea: `Fresh ${k} idea`, angle: "a cosy twist", why: "rising favourites" })) });
    }
    if (keys.includes("scores"))
      return req.schema.parse({
        scores: { demand: 9, competition: 4, aiFit: 8, pricePotential: 7 },
        summary: "Hot right now",
        reasons: ["a", "b", "c"],
        risks: [],
        angles: ["x", "y", "z"],
        keywords: ["mushroom wall art"],
        priceLowGBP: 1,
        priceHighGBP: 99,
        seasonality: "Autumn",
      });
    throw new Error("unexpected");
  },
  async image() {
    return "eA==";
  },
});

async function setup() {
  await setUpOwner();
  const db = getDb(env.DB);
  return { db, settings: await getSettings(db) };
}

describe("Trend Radar", () => {
  it("scans niches from Etsy and ranks the hot, uncrowded ones first", async () => {
    const { db, settings } = await setup();
    const calls: string[] = [];
    const etsy = etsyClient("key:secret", 0.79, fakeFetch(calls));
    // Make sure a mushroom niche is in the first batch.
    await env.DB.prepare("INSERT OR IGNORE INTO trend_niches (keyword, category, origin, score) VALUES ('mushroom wall art','wall art','seed',0)").run();
    const r = await radarTick(db, { ...settings, radar: { ...settings.radar, autoDaily: false } }, { etsy, ai: null, now, budget: 6 });
    expect(r.error).toBeNull();
    expect(r.scanned).toBe(6);
    expect(calls.every((c) => c.includes("sort_on=created"))).toBe(true);
    const top = await env.DB.prepare("SELECT * FROM trend_niches WHERE source='etsy' ORDER BY score DESC").all<any>();
    expect(top.results[0].keyword).toContain("mushroom");
    expect(top.results[0].median_price_pence).toBeGreaterThan(0);
    expect(top.results[0].favs_per_day).toBeGreaterThan(1);
    const total = await env.DB.prepare("SELECT count(*) n FROM trend_niches").first<any>();
    expect(total.n).toBeGreaterThanOrEqual(SEED_NICHES.length);
  });

  it("makes today's ideas from top niches and Scout researches them with live data", async () => {
    const { db, settings } = await setup();
    const etsy = etsyClient("key:secret", 0.79, fakeFetch([]));
    await env.DB.prepare("INSERT OR IGNORE INTO trend_niches (keyword, category, origin, score) VALUES ('mushroom wall art','wall art','seed',0)").run();
    await radarTick(db, { ...settings, radar: { ...settings.radar, autoDaily: false } }, { etsy, ai: null, now, budget: 8 });
    const ai = fakeAi();
    const items = await makeDailyIdeas(db, settings, ai, now);
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThanOrEqual(5);
    expect(items[0].idea).toMatch(/^Fresh/);
    const daily = await kvGet<any>(db, `daily:${now.toISOString().slice(0, 10)}`);
    expect(daily.items).toHaveLength(items.length);
    // Same niches aren't suggested again straight away.
    const more = await makeDailyIdeas(db, settings, ai, now);
    expect(more.map((i) => i.keyword)).not.toContain(items[0].keyword);
    // "More ideas now" adds to today's list instead of replacing it.
    expect((await kvGet<any>(db, `daily:${now.toISOString().slice(0, 10)}`)).items).toHaveLength(items.length + more.length);

    // Scout's report uses the real Etsy prices, not the AI's guess (£1–£99).
    const mush = items.find((i) => i.keyword.includes("mushroom"))!;
    await tick(db, settings, { interactive: false, ai, files: env.FILES });
    await env.DB.prepare("UPDATE tasks SET started_at = '2000-01-01T00:00:00.000Z' WHERE state = 'working'").run();
    await tick(db, settings, { interactive: false, ai, files: env.FILES });
    const t = await env.DB.prepare("SELECT output FROM tasks WHERE product_id = ? AND kind = 'niche_score'").bind(mush.productId).first<any>();
    const report = JSON.parse(t.output);
    expect(report.sources).toMatch(/Live Etsy data/);
    expect(report.priceRangePence[1]).toBeLessThan(1000);
  });

  it("picks niches with room to undercut before ones where the minimum profit is above the market", async () => {
    const { db, settings } = await setup();
    await env.DB.prepare("UPDATE trend_niches SET score = 0").run();
    await env.DB.prepare(
      "INSERT INTO trend_niches (keyword, category, origin, source, score, median_price_pence) VALUES ('cheap niche','x','you','etsy',90,150), ('roomy niche','x','you','etsy',60,600) ON CONFLICT(keyword) DO UPDATE SET score = excluded.score, median_price_pence = excluded.median_price_pence",
    ).run();
    const items = await makeDailyIdeas(db, { ...settings, radar: { ...settings.radar, dailyIdeas: 1 } }, fakeAi(), now);
    expect(items.map((i) => i.keyword)).toEqual(["roomy niche"]);
  });
});

describe("Price Watch", () => {
  it("flags a live product priced well above the market, once, and records your new price", async () => {
    const { db, settings } = await setup();
    const t = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO products (id,title,niche,stage,seed,price_pence,data,demo,created_at,updated_at) VALUES ('pw','Frog Print','frog','live',1,799,'{"competitors":[{"pricePence":399},{"pricePence":450},{"pricePence":420}]}',0,?,?)`,
    ).bind(t, t).run();
    expect(await priceWatchTick(db, settings, null, now)).toBe(1);
    expect(await priceWatchTick(db, settings, null, new Date(now.getTime() + 86_400_000))).toBe(0); // still open → no duplicate
    expect(await priceWatchTick(db, settings, null, now, 6, true)).toBe(0); // forced re-check doesn't duplicate either
    const alert = await env.DB.prepare("SELECT * FROM tasks WHERE kind='price_watch'").first<any>();
    const out = JSON.parse(alert.output);
    expect(out.medianPricePence).toBe(420);
    expect(out.suggestedPricePence).toBeLessThan(420);
    await approveTask(db, alert.id, settings, undefined, { pricePence: out.suggestedPricePence });
    const p = await env.DB.prepare("SELECT price_pence, stage FROM products WHERE id='pw'").first<any>();
    expect(p.price_pence).toBe(out.suggestedPricePence);
    expect(p.stage).toBe("live"); // closing an alert never touches the pipeline
  });

  it("a forced check picks up products launched after today's automatic run", async () => {
    const { db, settings } = await setup();
    expect(await priceWatchTick(db, settings, null, now)).toBe(0); // morning run: nothing live yet
    const t = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO products (id,title,niche,stage,seed,price_pence,data,demo,created_at,updated_at) VALUES ('pw2','Owl Print','owl','live',1,699,'{"competitors":[{"pricePence":299}]}',0,?,?)`,
    ).bind(t, t).run();
    expect(await priceWatchTick(db, settings, null, now)).toBe(0); // same day, automatic: already done
    expect(await priceWatchTick(db, settings, null, now, 6, true)).toBe(1); // "Run Price Watch now"
  });

  it("checks your Etsy shop's listings and can be ignored", async () => {
    const { db, settings } = await setup();
    const s = { ...settings, radar: { ...settings.radar, etsyShopName: "CosyShop" } };
    const etsy = etsyClient("key:secret", 0.79, fakeFetch([]));
    expect(await priceWatchTick(db, s, etsy, now, 10)).toBe(1);
    const alert = await env.DB.prepare("SELECT * FROM tasks WHERE kind='price_watch'").first<any>();
    expect(JSON.parse(alert.output).url).toBe("https://etsy.com/listing/1");
    await rejectTask(db, alert.id, "");
    expect((await env.DB.prepare("SELECT state FROM tasks WHERE id = ?").bind(alert.id).first<any>()).state).toBe("failed");
  });
});

describe("radar API", () => {
  it("lists the radar and lets you watch a niche", async () => {
    const c = await setUpOwner();
    const r = await c.get("/api/radar");
    expect(r.status).toBe(200);
    expect(r.data.etsyConnected).toBe(false);
    expect(r.data.watching).toBeGreaterThan(50);
    expect((await c.post("/api/radar/niches", { keyword: "Axolotl Nursery Art" })).status).toBe(200);
    const row = await env.DB.prepare("SELECT origin FROM trend_niches WHERE keyword='axolotl nursery art'").first<any>();
    expect(row.origin).toBe("you");
    expect((await c.get("/api/radar/test")).data.ok).toBe(false);
  });
});
