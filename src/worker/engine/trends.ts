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
import { FORMATS, guessFormat, isFormat, type ProductFormat } from "../../shared/format";
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

async function aiEstimate(db: DB, ai: AiServices, now: Date) {
  const month = now.toLocaleString("en-GB", { month: "long" });
  const pool = SEED_NICHES.map(([k]) => k);
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
      .select({ keyword: trendNiches.keyword })
      .from(trendNiches)
      .where(or(isNull(trendNiches.lastScanned), lt(trendNiches.lastScanned, new Date(now.getTime() - SCAN_EVERY_MS).toISOString()), eq(trendNiches.source, "ai")))
      .orderBy(sql`${trendNiches.lastScanned} IS NOT NULL`, asc(trendNiches.lastScanned))
      .limit(deps.budget ?? 6)
      .all();
    for (const n of stale) {
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
        await aiEstimate(db, deps.ai, now);
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

export interface DailyIdeas {
  date: string;
  at: string;
  items: { productId: string; keyword: string; idea: string; angle: string; format?: ProductFormat }[];
}

const ideasSchema = z.object({
  ideas: z.array(z.object({ keyword: z.string(), idea: z.string(), angle: z.string(), why: z.string(), format: z.string().optional() })),
});

/** Turn the top niches into fresh, competitive product ideas and send them to Scout. */
export async function makeDailyIdeas(db: DB, settings: Settings, ai: AiServices, now = new Date()) {
  const cutoff = new Date(now.getTime() - SUGGEST_COOLDOWN_MS).toISOString();
  const candidates = await db
    .select()
    .from(trendNiches)
    .where(and(sql`${trendNiches.score} > 0`, or(isNull(trendNiches.lastSuggested), lt(trendNiches.lastSuggested, cutoff)), await liveOnly(db)))
    .orderBy(desc(trendNiches.score))
    .limit(settings.radar.dailyIdeas * 4)
    .all();
  // Prefer niches where we can undercut the median and still clear the minimum profit.
  const floor = minimumPriceFor(settings.minProfitPence, 10, settings.fees);
  const roomToUndercut = (n: NicheRow) => (n.medianPricePence ?? 0) > floor;
  const top = [...candidates.filter(roomToUndercut), ...candidates.filter((n) => !roomToUndercut(n))].slice(0, settings.radar.dailyIdeas);
  if (!top.length) return [];
  const lines = top.map(
    (n) =>
      `- ${n.keyword}: [${nicheFormat(n.keyword, n.category)}] ${n.source === "etsy" ? `${n.totalListings?.toLocaleString()} competing listings, new listings getting ${n.favsPerDay} favourites/day, median price £${((n.medianPricePence ?? 0) / 100).toFixed(2)}` : `AI estimate${n.note ? `: ${n.note}` : ""}`}`,
  );
  // One batch per press: "More ideas now" asks for a fresh batch rather than reusing this morning's.
  const date = now.toISOString().slice(0, 10);
  const earlier = (await kvGet<DailyIdeas>(db, `daily:${date}`))?.items ?? [];
  const r = await ai.json({
    key: `daily:${date}:${earlier.length}`,
    label: `🎯 Today's ideas (${top.length})`,
    system:
      "You are Scout, the creative lead of a UK Etsy shop selling AI-assisted digital printables. Your job: beat competitors with fresh, specific, sellable ideas: a clear twist, not a copy. No brands, characters, celebrities or song lyrics.",
    prompt: `These niches are moving on Etsy right now:\n${lines.join("\n")}\nFor EACH niche, invent one innovative digital download that could outsell what's already there. Formats: "art" (printable wall art), "excel" (a ready-made spreadsheet with formulas, also works in Google Sheets), "pdf" (a printable planner/tracker/checklist). The format in [brackets] is the usual one for that niche; pick another if it would sell better. Give: keyword (as given), idea (under 60 characters), angle (the twist that makes it different, one sentence), why (why it will sell, one sentence), format.`,
    schema: ideasSchema,
    jsonSchema: {
      type: "object",
      properties: {
        ideas: {
          type: "array",
          items: {
            type: "object",
            properties: { keyword: { type: "string" }, idea: { type: "string" }, angle: { type: "string" }, why: { type: "string" }, format: { type: "string", enum: [...FORMATS] } },
            required: ["keyword", "idea", "angle", "why", "format"],
          },
        },
      },
      required: ["ideas"],
    },
    maxTokens: 1200,
  });
  const items: DailyIdeas["items"] = [];
  const unused = [...r.ideas];
  for (const niche of top) {
    const at = unused.findIndex((i) => i.keyword.trim().toLowerCase() === niche.keyword);
    const [idea] = unused.splice(at >= 0 ? at : 0, 1);
    if (!idea) continue;
    const market = niche.source === "etsy" ? marketOf(niche) : null;
    const notes = `Today's idea from Trend Radar (${niche.keyword}). Twist: ${idea.angle} Why: ${idea.why}`;
    const format = isFormat(idea.format) ? idea.format : nicheFormat(niche.keyword, niche.category);
    const p = await suggestIdea(db, settings, idea.idea.slice(0, 120), notes.slice(0, 1000), true, { market, trendKeyword: niche.keyword, origin: "daily", format });
    await db.update(trendNiches).set({ lastSuggested: nowIso(now) }).where(eq(trendNiches.keyword, niche.keyword));
    items.push({ productId: p.id, keyword: niche.keyword, idea: idea.idea.slice(0, 120), angle: idea.angle.slice(0, 300), format });
  }
  // "More ideas now" adds to today's list rather than replacing it.
  const daily: DailyIdeas = { date, at: nowIso(now), items: [...earlier, ...items] };
  await kvSet(db, `daily:${daily.date}`, daily);
  if (items.length) {
    await notify(db, "quest", `🎯 Today's ${items.length} ideas are in`, "Scout is researching them now. Check the Research Lab.", false);
    await logActivity(db, "scout", "research", "new", `🎯 Trend Radar picked today's ${items.length} ideas`, false);
  }
  return items;
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
