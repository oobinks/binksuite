// 📡 Trend Radar + 🎯 Daily ideas.
//
// With an Etsy API key: every few minutes the radar reads the newest active
// listings for a handful of watched niches (official API, a few calls at a
// time) and scores each niche on "favourites per day on new listings" (rising
// demand) against how crowded it is. Without a key it falls back to a daily AI
// estimate, clearly labelled.
//
// Each morning the best-scoring niches the shop hasn't tried recently become
// "Today's ideas": the AI invents an innovative product for each, and they go
// straight to Scout for research (you still approve before any art is made).
import { FUNCTIONAL_GUIDE_RULE, functionalGuideIn } from "../../shared/compliance";
import { and, asc, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "../db";
import { trendNiches } from "../db/schema";
import { kvGet, kvSet, nowIso } from "../lib/store";
import { readMarket, type MarketRead } from "../../shared/market";
import type { Settings } from "../../shared/settings";
import type { AiServices } from "../providers/ai";
import { isAiLimit } from "../providers/ai";
import { isClaudePending } from "../providers/claudeCode";
import { EtsyError, type EtsyClient } from "../providers/etsy";
import { suggestIdea, logActivity } from "./queue";
import { notify } from "./game";
import { enabledFormats, guessFormat, isFormat, pickFormat, type FormatSwitches, type ProductFormat } from "../../shared/format";
import { minimumPriceFor } from "../../shared/fees";

/** Starting watchlist: evergreen and seasonal digital-printable niches. You can add your own. */
export const SEED_NICHES: [string, string][] = [
  ...[
    "mushroom wall art", "botanical print", "cottagecore print", "frog print", "retro kitchen print", "abstract line art",
    "boho wall art", "minimalist poster", "vintage map print", "coastal wall art", "bathroom wall art", "funny bathroom sign",
    "nursery wall art", "kids room print", "dinosaur nursery", "safari nursery", "rainbow nursery", "playroom rules",
    "gallery wall set", "matisse print", "bauhaus poster", "exhibition poster", "wildflower print", "cat print",
    "dog portrait print", "bird print", "bee print", "strawberry print", "lemon print", "cherry print",
    "coffee bar sign", "bar cart print", "cocktail recipe print", "wine print", "book lover print", "reading nook print",
    "celestial print", "moon phase print", "tarot card print", "zodiac print", "positive affirmation print", "motivational quote",
  ].map((k): [string, string] => [k, "wall art"]),
  ...[
    "habit tracker", "budget planner", "meal planner", "weekly planner", "cleaning schedule", "reading journal",
    "self care checklist", "wedding planner", "baby milestone cards", "chore chart", "teacher planner", "homeschool planner",
    "adhd planner", "fitness tracker", "savings challenge", "travel itinerary", "password log", "recipe card",
  ].map((k): [string, string] => [k, "planners"]),
  ...[
    "christmas gift tags", "christmas wall art", "advent calendar printable", "christmas cards printable", "halloween print",
    "autumn print", "thanksgiving sign", "valentines card printable", "easter printable", "mothers day card printable",
    "fathers day card printable", "graduation sign", "back to school sign", "new year planner", "birthday sign printable",
    "baby shower games", "bridal shower games", "wedding welcome sign", "wedding seating chart", "party invitation template",
  ].map((k): [string, string] => [k, "seasonal & events"]),
  ...[
    "colouring pages adults", "kids colouring pages", "sticker sheet printable", "printable stickers", "bookmarks printable",
    "gift tags printable", "pantry labels", "classroom decor", "nursery name sign", "custom pet portrait",
  ].map((k): [string, string] => [k, "other printables"]),
  // 📊 Spreadsheets (Excel / Google Sheets)
  ...[
    "budget spreadsheet", "monthly budget spreadsheet", "christmas budget spreadsheet", "christmas gift tracker spreadsheet",
    "wedding budget spreadsheet", "debt payoff spreadsheet", "savings tracker spreadsheet", "bill tracker spreadsheet",
    "expense tracker spreadsheet", "sinking funds spreadsheet", "small business spreadsheet", "etsy seller spreadsheet",
    "meal planner spreadsheet", "habit tracker spreadsheet", "travel budget spreadsheet", "renovation budget spreadsheet",
    "cleaning schedule spreadsheet", "reading log spreadsheet", "fitness tracker spreadsheet", "baby feeding spreadsheet",
  ].map((k): [string, string] => [k, "spreadsheets"]),
  // 📄 Printable trackers and planners (PDF)
  ...[
    "christmas gift list printable", "christmas planner printable", "christmas card list", "monthly budget planner printable",
    "bill tracker printable", "savings challenge printable", "debt tracker printable", "packing list printable",
    "weekly meal planner printable", "daily planner printable", "to do list printable", "goal planner printable",
  ].map((k): [string, string] => [k, "printable trackers"]),
];

/** What a radar niche would be made as: spreadsheet niches → Excel, tracker/planner niches → PDF. */
/** Is this niche one the shop is making right now? */
export const nicheWanted = (n: { keyword: string; category?: string | null }, on: FormatSwitches) => on[nicheFormat(n.keyword, n.category)];

export function nicheFormat(keyword: string, category?: string | null): ProductFormat {
  if (category === "spreadsheets" || /spreadsheet|excel|google sheets/i.test(keyword)) return "excel";
  if (category === "printable trackers") return "pdf";
  return guessFormat(keyword);
}

const SCAN_EVERY_MS = 20 * 3600_000;
const SUGGEST_COOLDOWN_MS = 14 * 86_400_000;

const SEEDS_VERSION = 2;

/** Load the starter watchlist once (bump SEEDS_VERSION to add new seeds later). */
export async function ensureSeeds(db: DB) {
  if ((await kvGet<number>(db, "radarSeeds")) === SEEDS_VERSION) return;
  const rows = SEED_NICHES.map(([keyword, category]) => ({ keyword, category, origin: "seed" }));
  for (let i = 0; i < rows.length; i += 20) await db.insert(trendNiches).values(rows.slice(i, i + 20)).onConflictDoNothing();
  await kvSet(db, "radarSeeds", SEEDS_VERSION);
}

export async function watchNiche(db: DB, keyword: string, category = "yours") {
  const k = keyword.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 60);
  if (k.length < 3) throw new Error("Give the niche a few more letters.");
  await db.insert(trendNiches).values({ keyword: k, category, origin: "you" }).onConflictDoNothing();
  return k;
}

function marketRow(m: MarketRead, source: "etsy" | "ai", note: string | null) {
  return {
    source,
    lastScanned: nowIso(),
    totalListings: m.totalListings,
    medianPricePence: m.medianPricePence,
    lowPricePence: m.lowPricePence,
    favsPerDay: m.favsPerDay,
    newListings30d: m.newListings30d,
    score: m.score,
    note,
  };
}

/** Read one niche from Etsy and store the result. */
export async function scanNiche(db: DB, etsy: EtsyClient, keyword: string, now = new Date()): Promise<MarketRead | null> {
  const r = await etsy.search(keyword, "created", 100);
  const m = readMarket(r.listings, r.total, now);
  if (m) await db.update(trendNiches).set(marketRow(m, "etsy", null)).where(eq(trendNiches.keyword, keyword));
  else await db.update(trendNiches).set({ lastScanned: nowIso(now), source: "etsy", score: 0, totalListings: r.total }).where(eq(trendNiches.keyword, keyword));
  return m;
}

// Without an Etsy key: one AI pass a day gives rough estimates so the radar isn't empty.
const aiEstimateSchema = z.object({
  niches: z.array(z.object({ keyword: z.string(), demand: z.number(), competition: z.number(), typicalPriceGBP: z.number(), note: z.string() })),
});

async function aiEstimate(db: DB, ai: AiServices, now: Date, on: FormatSwitches) {
  const month = now.toLocaleString("en-GB", { month: "long" });
  const pool = SEED_NICHES.filter(([keyword, category]) => nicheWanted({ keyword, category }, on)).map(([k]) => k);
  const r = await ai.json({
    key: `estimate:${now.toISOString().slice(0, 10)}`,
    label: "Trend Radar: today's estimates",
    system: "You are Scout, a market researcher for a UK Etsy shop selling digital printables. Be realistic; these are estimates.",
    prompt: `It's ${month}. From this list, pick the 15 niches most likely to be selling well on Etsy right now, and rate each: demand 1-10 (rising interest now), competition 1-10 (10 = very crowded), a typical price in GBP, and a short note why.\nList: ${pool.join(", ")}`,
    schema: aiEstimateSchema,
    jsonSchema: {
      type: "object",
      properties: {
        niches: {
          type: "array",
          items: {
            type: "object",
            properties: { keyword: { type: "string" }, demand: { type: "number" }, competition: { type: "number" }, typicalPriceGBP: { type: "number" }, note: { type: "string" } },
            required: ["keyword", "demand", "competition", "typicalPriceGBP", "note"],
          },
        },
      },
      required: ["niches"],
    },
    maxTokens: 1200,
  });
  for (const n of r.niches.slice(0, 15)) {
    const keyword = n.keyword.trim().toLowerCase();
    const demand = Math.max(1, Math.min(10, n.demand));
    const competition = Math.max(1, Math.min(10, n.competition));
    const price = Math.max(100, Math.round(n.typicalPriceGBP * 100));
    await db
      .insert(trendNiches)
      .values({ keyword, category: "ai pick", origin: "ai" })
      .onConflictDoNothing();
    await db
      .update(trendNiches)
      .set({
        source: "ai",
        lastScanned: nowIso(now),
        score: Math.round((demand * (11 - competition)) / 1.0),
        medianPricePence: price,
        lowPricePence: Math.round(price * 0.8),
        totalListings: null,
        favsPerDay: null,
        newListings30d: null,
        note: n.note.slice(0, 200),
      })
      .where(eq(trendNiches.keyword, keyword));
  }
}

export interface RadarDeps {
  etsy: EtsyClient | null;
  ai: AiServices | null;
  now?: Date;
  /** Max Etsy calls this run (free plan allows 50 outbound requests per run). */
  budget?: number;
}

export interface RadarResult {
  scanned: number;
  dailyCreated: number;
  error: string | null;
}

/** One radar pass: scan a few stale niches, and make today's ideas if it's time. */
export async function radarTick(db: DB, settings: Settings, deps: RadarDeps): Promise<RadarResult> {
  const now = deps.now ?? new Date();
  const result: RadarResult = { scanned: 0, dailyCreated: 0, error: null };
  await ensureSeeds(db);

  if (deps.etsy) {
    const stale = await db
      .select({ keyword: trendNiches.keyword, category: trendNiches.category })
      .from(trendNiches)
      .where(or(isNull(trendNiches.lastScanned), lt(trendNiches.lastScanned, new Date(now.getTime() - SCAN_EVERY_MS).toISOString()), eq(trendNiches.source, "ai")))
      .orderBy(sql`${trendNiches.lastScanned} IS NOT NULL`, asc(trendNiches.lastScanned))
      .limit((deps.budget ?? 6) * 4)
      .all();
    // Only spend Etsy calls on the kinds of product you're making.
    for (const n of stale.filter((x) => nicheWanted(x, settings.formats)).slice(0, deps.budget ?? 6)) {
      try {
        await scanNiche(db, deps.etsy, n.keyword, now);
        result.scanned++;
      } catch (e) {
        result.error = e instanceof Error ? e.message : String(e);
        await kvSet(db, "radarError", { at: nowIso(now), message: result.error });
        if (e instanceof EtsyError) break; // bad key or rate limit: stop for this run
      }
    }
    if (result.scanned && !result.error) await kvSet(db, "radarError", null);
  } else if (deps.ai) {
    const day = now.toISOString().slice(0, 10);
    if ((await kvGet<string>(db, "radarAiDay")) !== day) {
      try {
        await aiEstimate(db, deps.ai, now, settings.formats);
        await kvSet(db, "radarAiDay", day);
      } catch (e) {
        if (!isAiLimit(e) && !isClaudePending(e)) result.error = e instanceof Error ? e.message : String(e);
      }
    }
  }

  // Today's ideas: from 6am UTC, once a day.
  if (settings.radar.autoDaily && deps.ai && now.getUTCHours() >= 6) {
    const day = now.toISOString().slice(0, 10);
    if (!(await kvGet<DailyIdeas>(db, `daily:${day}`))) {
      try {
        result.dailyCreated = (await makeDailyIdeas(db, settings, deps.ai, now)).length;
      } catch (e) {
        if (!isAiLimit(e) && !isClaudePending(e)) result.error = e instanceof Error ? e.message : String(e);
      }
    }
  }
  return result;
}

/** One of today's ideas: a niche on the move plus Scout's twist, scored so the best come first. */
export interface DailyIdea {
  id: string;
  keyword: string;
  idea: string;
  angle: string;
  why?: string;
  format?: ProductFormat;
  /** Scout's 1-10: demand, beatable competition, profit and how premium we can make it. */
  score?: number;
  market?: { totalListings: number | null; medianPricePence: number | null; favsPerDay: number | null } | null;
  /** Set once you pick it (or for older days, when every idea was started automatically). */
  productId?: string;
}

export interface DailyIdeas {
  date: string;
  at: string;
  items: DailyIdea[];
  /** How many fresh batches today ("Refresh ideas"). */
  batch?: number;
  /** The idea you chose to make today. */
  pickedId?: string;
}

const ideasSchema = z.object({
  ideas: z.array(z.object({ keyword: z.string(), idea: z.string(), angle: z.string(), why: z.string(), format: z.string().optional(), score: z.number().optional() })),
});

const SHOWN_RECENTLY_DAYS = 3;

/**
 * Today's ideas: Scout invents an idea for each of the top niches, scores them, and the
 * best few are kept for you to choose from. Nothing is started until you pick one
 * (one product a day). "Refresh" swaps them for a fresh batch, until you've picked.
 */
export async function makeDailyIdeas(db: DB, settings: Settings, ai: AiServices, now = new Date(), opts: { refresh?: boolean } = {}) {
  const date = now.toISOString().slice(0, 10);
  const today = await kvGet<DailyIdeas>(db, `daily:${date}`);
  if (today?.pickedId) return today.items;
  if (today?.items.length && !opts.refresh) return today.items;
  const cutoff = new Date(now.getTime() - SUGGEST_COOLDOWN_MS).toISOString();
  const candidates = await db
    .select()
    .from(trendNiches)
    .where(and(sql`${trendNiches.score} > 0`, or(isNull(trendNiches.lastSuggested), lt(trendNiches.lastSuggested, cutoff)), await liveOnly(db)))
    .orderBy(desc(trendNiches.score))
    .limit(60)
    .all();
  // Fresh each day: a refresh never repeats today's; niches shown in the last few days come last.
  const todays = new Set<string>(today?.items.map((i) => i.keyword) ?? []);
  const shown = new Set<string>();
  for (let d = 1; d <= SHOWN_RECENTLY_DAYS; d++) {
    const day = new Date(now.getTime() - d * 86_400_000).toISOString().slice(0, 10);
    for (const i of (await kvGet<DailyIdeas>(db, `daily:${day}`))?.items ?? []) shown.add(i.keyword);
  }
  const keep = settings.radar.dailyIdeas;
  // Prefer niches where we can undercut the median and still clear the minimum profit.
  const floor = minimumPriceFor(settings.minProfitPence, 10, settings.fees);
  const roomToUndercut = (n: NicheRow) => (n.medianPricePence ?? 0) > floor;
  const wanted = candidates.filter((n) => nicheWanted(n, settings.formats) && !todays.has(n.keyword));
  const pool = [...wanted.filter((n) => !shown.has(n.keyword)), ...wanted.filter((n) => shown.has(n.keyword))];
  // Twice as many as you'll see, so Scout's scores pick the best of them.
  const top = [...pool.filter(roomToUndercut), ...pool.filter((n) => !roomToUndercut(n))].slice(0, keep * 2);
  const formats = enabledFormats(settings.formats);
  const formatHelp: Record<ProductFormat, string> = {
    art: '"art" (printable wall art)',
    excel: '"excel" (a ready-made spreadsheet with formulas, also works in Google Sheets)',
    pdf: '"pdf" (a printable planner/tracker/checklist)',
  };
  if (!top.length) return [];
  const lines = top.map(
    (n) =>
      `- ${n.keyword}: [${pickFormat(nicheFormat(n.keyword, n.category), settings.formats)}] ${n.source === "etsy" ? `${n.totalListings?.toLocaleString()} competing listings, new listings getting ${n.favsPerDay} favourites/day, median price £${((n.medianPricePence ?? 0) / 100).toFixed(2)}` : `AI estimate${n.note ? `: ${n.note}` : ""}`}`,
  );
  const batch = (today?.batch ?? 0) + (today ? 1 : 0);
  const r = await ai.json({
    key: `daily:${date}:${batch}`,
    label: `🎯 Today's ideas`,
    system:
      "You are Scout, the creative lead of a UK Etsy shop selling AI-assisted digital downloads. Your job: beat competitors with fresh, specific, sellable ideas: a clear twist, not a copy. Be a tough judge: the owner makes only one product a day, so only the very best should score high. No brands, characters, celebrities or song lyrics. " + FUNCTIONAL_GUIDE_RULE,
    prompt: `These niches are moving on Etsy right now:\n${lines.join("\n")}\nFor EACH niche, invent one innovative digital download that could outsell what's already there. Formats (the shop only makes these right now): ${formats.map((f) => formatHelp[f]).join(", ")}. The format in [brackets] is the usual one for that niche; pick another of these if it would sell better.\nThen score each idea 1-10 (decimals fine) for how good a bet it is today: real demand right now, competition we can beat, room for a healthy price, and how premium we can make it. Give: keyword (as given), idea (under 60 characters), angle (the twist that makes it different, one sentence), why (why it will sell, one sentence), format, score.`,
    schema: ideasSchema,
    jsonSchema: {
      type: "object",
      properties: {
        ideas: {
          type: "array",
          items: {
            type: "object",
            properties: {
              keyword: { type: "string" },
              idea: { type: "string" },
              angle: { type: "string" },
              why: { type: "string" },
              format: { type: "string", enum: [...formats] },
              score: { type: "number" },
            },
            required: ["keyword", "idea", "angle", "why", "format", "score"],
          },
        },
      },
      required: ["ideas"],
    },
    maxTokens: 2000,
  });
  const scored: DailyIdea[] = [];
  const unused = [...r.ideas];
  for (const [rank, niche] of top.entries()) {
    const at = unused.findIndex((i) => i.keyword.trim().toLowerCase() === niche.keyword);
    if (at < 0) continue;
    const [idea] = unused.splice(at, 1);
    if (functionalGuideIn(`${idea.idea} ${idea.angle}`)) continue; // Etsy doesn't allow AI-written guides
    const market = niche.source === "etsy" ? { totalListings: niche.totalListings, medianPricePence: niche.medianPricePence, favsPerDay: niche.favsPerDay } : null;
    scored.push({
      id: `${date}-${batch}-${rank}`,
      keyword: niche.keyword,
      idea: idea.idea.slice(0, 120),
      angle: idea.angle.slice(0, 300),
      why: idea.why.slice(0, 300),
      format: pickFormat(isFormat(idea.format) ? idea.format : nicheFormat(niche.keyword, niche.category), settings.formats),
      score: Math.max(1, Math.min(10, Math.round((Number(idea.score) || 5) * 10) / 10)),
      market,
    });
  }
  // The best few, best first (the niche's own heat breaks ties).
  const items = scored.sort((x, y) => (y.score ?? 0) - (x.score ?? 0)).slice(0, keep);
  const daily: DailyIdeas = { date, at: nowIso(now), items, batch };
  await kvSet(db, `daily:${date}`, daily);
  if (items.length) {
    await notify(db, "quest", `🎯 Today's ${items.length} ideas are ready`, "Pick the one to make today in the Research Lab.", false);
    await logActivity(db, "scout", "research", "new", `🎯 Trend Radar lined up today's ${items.length} best ideas. Pick one!`, false);
  }
  return items;
}

/** You chose today's product: it goes to Scout for full research. One a day unless you insist. */
export async function pickDailyIdea(db: DB, settings: Settings, id: string, opts: { force?: boolean; realAi: boolean; now?: Date }) {
  const now = opts.now ?? new Date();
  const date = now.toISOString().slice(0, 10);
  const daily = await kvGet<DailyIdeas>(db, `daily:${date}`);
  const item = daily?.items.find((i) => i.id === id);
  if (!daily || !item) throw new Error("That idea isn't on today's list any more.");
  if (item.productId) return { productId: item.productId, already: true };
  if (daily.pickedId && !opts.force) {
    const chosen = daily.items.find((i) => i.id === daily.pickedId);
    return { needsConfirm: true, chosen: chosen?.idea ?? "another idea" };
  }
  const niche = await db.select().from(trendNiches).where(eq(trendNiches.keyword, item.keyword)).get();
  const notes = `Today's pick from Trend Radar (${item.keyword}). Twist: ${item.angle}${item.why ? ` Why: ${item.why}` : ""}`;
  const p = await suggestIdea(db, settings, item.idea, notes.slice(0, 1000), opts.realAi, {
    market: niche?.source === "etsy" ? marketOf(niche) : null,
    trendKeyword: item.keyword,
    origin: "daily",
    format: item.format,
  });
  await db.update(trendNiches).set({ lastSuggested: nowIso(now) }).where(eq(trendNiches.keyword, item.keyword));
  item.productId = p.id;
  daily.pickedId ??= item.id;
  await kvSet(db, `daily:${date}`, daily);
  await logActivity(db, "scout", "research", "new", `🎯 You picked today's product: “${item.idea}”. Scout is on it!`, false);
  return { productId: p.id };
}

export type NicheRow = typeof trendNiches.$inferSelect;

/**
 * AI guesses and live Etsy reads score on different scales, so once any niche
 * has live data, rank only live niches. Returns a where-clause (or nothing).
 */
export async function liveOnly(db: DB) {
  const live = await db.select({ k: trendNiches.keyword }).from(trendNiches).where(and(eq(trendNiches.source, "etsy"), sql`${trendNiches.score} > 0`)).limit(1).get();
  return live ? eq(trendNiches.source, "etsy") : undefined;
}

export function marketOf(n: NicheRow) {
  return {
    keyword: n.keyword,
    totalListings: n.totalListings ?? 0,
    medianPricePence: n.medianPricePence ?? 0,
    lowPricePence: n.lowPricePence ?? 0,
    favsPerDay: n.favsPerDay ?? 0,
    newListings30d: n.newListings30d ?? 0,
    score: n.score,
    scannedAt: n.lastScanned,
  };
}

export type ProductMarket = ReturnType<typeof marketOf>;
