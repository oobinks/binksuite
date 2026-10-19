// Real agents (Phase 2) — powered by Cloudflare's free Workers AI.
// Each entry upgrades a pipeline step for real (non-demo) products.
// Demo products keep using the canned handlers in index.ts.
import { z } from "zod";
import { blockedTermsIn, ETSY_LIMITS, hasAiDisclosure } from "../../../shared/compliance";
import type { MarketReport, Verdict } from "./marketResearch";
import type { PartialResult, ProductRow, RealContext, StepDef, StepResult, TaskRow } from "./types";
import { FORMAT_INFO, formatOf, isSheetFormat, type ProductFormat } from "../../../shared/format";
import { SHEET_JSON_SCHEMA, SHEET_RULES, tidySheetSpec, type RawSpec, type SheetSpec } from "../../../shared/sheetSpec";
import { SCENE_VARIANTS, sceneKey, scenesFor, type MockupView, type SceneDef } from "../../../shared/mockupScenes";

export const IMAGES_PER_PRODUCT = 4;
export const PRINT_SIZES_REAL = ["A5", "A4", "A3", "US Letter", "8x10"] as const;

const AI_NOTE = "AI estimate from general knowledge. The free Cloudflare AI can't browse the web, so double-check big decisions on Etsy yourself.";

/** An Analyst idea to make the product stronger, which you can switch on. */
export interface Booster {
  id: string;
  kind: "slogan" | "art" | "bundle" | "listing" | "feature";
  title: string;
  why: string;
  /** How the art (or, for spreadsheets, the design) should change if chosen. */
  artHint?: string;
  /** What the listing should mention if chosen. */
  listingHint?: string;
  /** Slogan options (kind = slogan). */
  slogans?: string[];
}

/** A booster you chose (slogan = the exact wording you picked/edited). */
export interface ChosenBooster {
  id: string;
  kind: Booster["kind"];
  title: string;
  artHint?: string;
  listingHint?: string;
  slogan?: string;
}

interface ProductData {
  suggestion?: { idea: string; notes?: string };
  report?: MarketReport;
  brief?: Brief;
  boosters?: ChosenBooster[];
  slogan?: string;
  images?: ArtImage[];
  keptImages?: string[];
  listing?: { title: string; tags: string[]; description: string; designedBy: "seller" };
  sheet?: SheetSpec;
  /** Spreadsheet pictures for mockup screens: the table, the dashboard and a printed page. */
  screens?: { table?: string; dash?: string; page?: string };
  zipKey?: string;
  files?: string[];
}

export interface ArtImage {
  key: string;
  prompt: string;
}

const d = (p: ProductRow) => p.data as ProductData;
const clampScore = (n: number) => Math.max(1, Math.min(10, Math.round(n)));

// ───────────── Scout: market research on your idea ─────────────

const reportSchema = z.object({
  scores: z.object({ demand: z.number(), competition: z.number(), aiFit: z.number(), pricePotential: z.number() }),
  summary: z.string(),
  reasons: z.array(z.string()).min(1),
  risks: z.array(z.string()),
  angles: z.array(z.string()).min(1),
  keywords: z.array(z.string()).min(1),
  priceLowGBP: z.number(),
  priceHighGBP: z.number(),
  seasonality: z.string(),
});

const reportJsonSchema = {
  type: "object",
  properties: {
    scores: {
      type: "object",
      properties: { demand: { type: "number" }, competition: { type: "number" }, aiFit: { type: "number" }, pricePotential: { type: "number" } },
      required: ["demand", "competition", "aiFit", "pricePotential"],
    },
    summary: { type: "string" },
    reasons: { type: "array", items: { type: "string" } },
    risks: { type: "array", items: { type: "string" } },
    angles: { type: "array", items: { type: "string" } },
    keywords: { type: "array", items: { type: "string" } },
    priceLowGBP: { type: "number" },
    priceHighGBP: { type: "number" },
    seasonality: { type: "string" },
  },
  required: ["scores", "summary", "reasons", "risks", "angles", "keywords", "priceLowGBP", "priceHighGBP", "seasonality"],
};

const SHOP_CONTEXT =
  "You work for a small UK Etsy shop that sells AI-assisted digital downloads: wall art prints, printable planners and trackers (PDF), and ready-made spreadsheets (Excel, which also open in Google Sheets). Use British spelling. Be honest and practical; never invent statistics or name real competitor shops.";

/** What the product is, in words the AI understands. */
export function formatLine(f: ProductFormat): string {
  return f === "excel"
    ? "Product type: a ready-made Excel spreadsheet (.xlsx, also opens in Google Sheets and Apple Numbers) with working formulas, plus a printable PDF version."
    : f === "pdf"
      ? "Product type: a printable PDF planner / tracker / checklist that buyers print and fill in by hand."
      : "Product type: printable wall art (high-resolution PDF prints).";
}

/** What's in the download, for listings and briefs. */
export function includedLine(f: ProductFormat): string {
  return f === "excel"
    ? "Excel spreadsheet (.xlsx) that also opens in Google Sheets and Apple Numbers, plus a printable PDF in A4 and US Letter"
    : f === "pdf"
      ? "Printable PDF in A4 and US Letter"
      : `High-resolution PDFs at 300 DPI in ${PRINT_SIZES_REAL.join(", ")}`;
}

export function verdictFrom(overall: number, blocked: boolean): Verdict {
  if (blocked) return "skip";
  return overall >= 7 ? "go" : overall >= 5.5 ? "maybe" : "skip";
}

export function cleanKeywords(list: string[], max: number = ETSY_LIMITS.tagsMax): string[] {
  const out: string[] = [];
  for (const raw of list) {
    const k = raw.toLowerCase().replace(/[^a-z0-9 '&-]/g, " ").replace(/\s+/g, " ").trim().slice(0, ETSY_LIMITS.tagCharsMax).trim();
    if (k && !out.includes(k)) out.push(k);
    if (out.length >= max) break;
  }
  return out;
}

export interface LiveMarket {
  keyword: string;
  totalListings: number;
  medianPricePence: number;
  lowPricePence: number;
  favsPerDay: number;
  newListings30d: number;
  scannedAt?: string | null;
}

export async function researchIdeaWithAi(ctx: RealContext, idea: string, notes?: string): Promise<MarketReport> {
  const market = (ctx.product.data as { market?: LiveMarket }).market;
  const marketLine = market
    ? `Live Etsy data for "${market.keyword}": ${market.totalListings} active competing listings; new listings are getting ${market.favsPerDay} favourites per day; ${market.newListings30d} of the newest 100 were listed in the last 30 days; median price £${(market.medianPricePence / 100).toFixed(2)}, cheaper quarter at £${(market.lowPricePence / 100).toFixed(2)}. Base demand and competition scores on this.\n`
    : "";
  const format = formatOf(ctx.product);
  const r = await ctx.ai.json({
    system: `${SHOP_CONTEXT} You are Scout, a market researcher. Score each 1-10. For competition, 10 means extremely crowded. "aiFit" means how well this shop's tools can make it well.`,
    prompt: `Assess this product idea for the shop.\nIdea: ${idea}\n${formatLine(format)}\n${notes ? `Owner's notes: ${notes}\n` : ""}${marketLine}Give: scores, a 1-2 sentence summary, exactly 3 reasons, risks (trademarks, seasonality, hard-to-make details), 3 specific angles to stand out, 8 Etsy search keywords (each under 20 characters), a typical price range in GBP for similar digital downloads of this type, and when it sells best.`,
    schema: reportSchema,
    jsonSchema: reportJsonSchema,
  });
  const scores = {
    demand: clampScore(r.scores.demand),
    competition: clampScore(r.scores.competition),
    aiFit: clampScore(r.scores.aiFit),
    pricePotential: clampScore(r.scores.pricePotential),
  };
  const overall = Math.round(((scores.demand + (11 - scores.competition) + scores.aiFit + scores.pricePotential) / 4) * 10) / 10;
  const blocked = blockedTermsIn(`${idea} ${notes ?? ""}`, ctx.settings.blocklist);
  const risks = r.risks.slice(0, 5);
  if (blocked.length) risks.unshift(`Uses a protected name (${blocked.join(", ")}). Etsy can remove listings like this. Pick an unbranded version instead.`);
  // Real Etsy prices beat the AI's guess whenever we have them.
  const lo = market?.lowPricePence || Math.max(99, Math.round(Math.min(r.priceLowGBP, r.priceHighGBP) * 100));
  const hi = market?.medianPricePence && market.medianPricePence > lo ? market.medianPricePence : Math.max(lo + 100, Math.round(Math.max(r.priceLowGBP, r.priceHighGBP) * 100));
  return {
    idea,
    verdict: verdictFrom(overall, blocked.length > 0),
    overall,
    scores,
    summary: r.summary.trim(),
    reasons: r.reasons.slice(0, 3),
    risks,
    angles: r.angles.slice(0, 3),
    keywords: cleanKeywords(r.keywords, 8),
    priceRangePence: [lo, hi],
    seasonality: r.seasonality.trim() || "Sells year-round.",
    sources: market
      ? `Live Etsy data (${market.totalListings.toLocaleString()} competing listings, checked ${market.scannedAt ? new Date(market.scannedAt).toLocaleDateString("en-GB") : "recently"}) plus AI judgement. Price range = cheaper quarter to median.`
      : AI_NOTE,
  };
}

// ───────────── Scout: "suggest ideas for me" ─────────────

const ideasSchema = z.object({ ideas: z.array(z.object({ idea: z.string(), why: z.string() })).min(1) });

export async function brainstormIdeas(ai: RealContext["ai"], theme: string | undefined, avoid: string[]) {
  const r = await ai.json({
    system: `${SHOP_CONTEXT} You are Scout. Suggest specific, sellable niches, not generic categories.`,
    prompt: `Suggest 5 digital download product ideas (a mix of wall art, printable planners/trackers and ready-made spreadsheets)${theme ? ` around: ${theme}` : " that suit the coming season"}. Avoid brands, characters and celebrities.${avoid.length ? ` Don't repeat: ${avoid.slice(0, 20).join("; ")}.` : ""} Each idea under 60 characters with a one-sentence reason.`,
    schema: ideasSchema,
    jsonSchema: {
      type: "object",
      properties: { ideas: { type: "array", items: { type: "object", properties: { idea: { type: "string" }, why: { type: "string" } }, required: ["idea", "why"] } } },
      required: ["ideas"],
    },
    maxTokens: 600,
  });
  return r.ideas.slice(0, 5).map((i) => ({ idea: i.idea.slice(0, 120), why: i.why.slice(0, 200) }));
}

// ───────────── Analyst: product brief + art prompts ─────────────

interface Brief {
  productTitle: string;
  audience: string;
  style: string;
  palette: string[];
  imagePrompts: string[];
}

const briefSchema = z.object({
  productTitle: z.string(),
  audience: z.string(),
  style: z.string(),
  palette: z.array(z.string()),
  imagePrompts: z.array(z.string()).min(1),
  boosters: z
    .array(
      z.object({
        kind: z.string(),
        title: z.string(),
        why: z.string(),
        artHint: z.string().optional(),
        listingHint: z.string().optional(),
        slogans: z.array(z.string()).optional(),
      }),
    )
    .default([]),
});

const BOOSTER_KINDS = ["slogan", "art", "bundle", "listing", "feature"] as const;

/** Tidy the Analyst's booster ideas. Art always gets a slogan option; spreadsheets don't need one. */
export function tidyBoosters(raw: z.infer<typeof briefSchema>["boosters"], idea: string, format: ProductFormat = "art"): Booster[] {
  const out: Booster[] = [];
  for (const b of raw.slice(0, 6)) {
    let kind = (BOOSTER_KINDS as readonly string[]).includes(b.kind) ? (b.kind as Booster["kind"]) : "art";
    if (isSheetFormat(format) && (kind === "art" || kind === "slogan")) kind = "feature";
    if (!isSheetFormat(format) && kind === "feature") kind = "art";
    const slogans = (b.slogans ?? []).map((x) => x.replace(/^["“']|["”']$/g, "").trim()).filter((x) => x && x.length <= 60).slice(0, 4);
    if (kind === "slogan" && !slogans.length) continue;
    out.push({
      id: `b${out.length + 1}`,
      kind,
      title: b.title.trim().slice(0, 80),
      why: b.why.trim().slice(0, 200),
      artHint: b.artHint?.trim().slice(0, 300) || undefined,
      listingHint: b.listingHint?.trim().slice(0, 300) || undefined,
      slogans: kind === "slogan" ? slogans : undefined,
    });
  }
  if (!isSheetFormat(format) && !out.some((b) => b.kind === "slogan")) {
    out.unshift({
      id: "b0",
      kind: "slogan",
      title: "Add a catchy slogan",
      why: "A short line of text makes prints more giftable and easier to find in search.",
      slogans: [idea.split(/\s+/).slice(0, 4).join(" ")],
    });
  }
  return out;
}

async function writeBrief(ctx: RealContext): Promise<StepResult> {
  if (isSheetFormat(formatOf(ctx.product))) return writeSheetBrief(ctx);
  const data = d(ctx.product);
  const idea = data.suggestion?.idea ?? ctx.product.niche;
  const report = data.report;
  const b = await ctx.ai.json({
    system: `${SHOP_CONTEXT} You are Analyst. Turn an approved idea into a product brief and image-generation prompts.`,
    prompt: `Idea: ${idea}\n${data.suggestion?.notes ? `Owner's notes: ${data.suggestion.notes}\n` : ""}${report ? `Scout's angles: ${report.angles.join("; ")}\n` : ""}Write: a short product title (under 50 characters), the target audience, the art style, a palette of 5 hex colours, and ${IMAGES_PER_PRODUCT} different image prompts for a text-to-image model. Prompts must describe printable artwork only: no words, letters or watermarks in the image, no brands or characters, plain composition suitable for framing.\nThen think like a shop owner who wants this to outsell competitors: suggest 3-5 "boosters", creative improvements the owner can switch on. Always include one kind "slogan" with 3 short catchy slogan options (under 40 characters, original, no song lyrics or trademarks). Other kinds: "art" (a style/colour/composition twist, with artHint describing how the image should change), "bundle" (e.g. matching set, multiple colourways, extra sizes, with listingHint), "listing" (e.g. personalisation offer, gift angle, with listingHint). Each with a one-sentence why.`,
    schema: briefSchema,
    jsonSchema: {
      type: "object",
      properties: {
        productTitle: { type: "string" },
        audience: { type: "string" },
        style: { type: "string" },
        palette: { type: "array", items: { type: "string" } },
        imagePrompts: { type: "array", items: { type: "string" } },
        boosters: {
          type: "array",
          items: {
            type: "object",
            properties: {
              kind: { type: "string", enum: ["slogan", "art", "bundle", "listing"] },
              title: { type: "string" },
              why: { type: "string" },
              artHint: { type: "string" },
              listingHint: { type: "string" },
              slogans: { type: "array", items: { type: "string" } },
            },
            required: ["kind", "title", "why"],
          },
        },
      },
      required: ["productTitle", "audience", "style", "palette", "imagePrompts", "boosters"],
    },
    maxTokens: 1600,
  });
  const boosters = tidyBoosters(b.boosters, idea);
  const brief: Brief = {
    productTitle: b.productTitle.trim().slice(0, 60) || idea,
    audience: b.audience.trim(),
    style: b.style.trim(),
    palette: b.palette.filter((c) => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 5),
    imagePrompts: Array.from({ length: IMAGES_PER_PRODUCT }, (_, i) => b.imagePrompts[i % b.imagePrompts.length]).map(
      (p) => `${p.trim()}. ${b.style.trim()} style, high detail printable wall art, no text, no lettering, no watermark`,
    ),
  };
  return {
    output: { productType: "Digital printable", ...brief, sizes: PRINT_SIZES_REAL, boosters },
    productData: { brief, palette: brief.palette, audience: brief.audience },
    productTitle: brief.productTitle,
    log: `Brief ready for “${brief.productTitle}”, with ${boosters.length} ideas to make it stronger`,
  };
}

/** You approve the brief with the boosters you like (and any idea of your own). */
function chooseBoosters(task: TaskRow, product: ProductRow, data: Record<string, unknown> | undefined) {
  const offered = ((task.output as { boosters?: Booster[] } | null)?.boosters ?? []) as Booster[];
  const picks = Array.isArray(data?.chosen) ? (data!.chosen as { id?: unknown; slogan?: unknown }[]) : [];
  const chosen: ChosenBooster[] = [];
  for (const p of picks) {
    const b = offered.find((o) => o.id === p.id);
    if (!b) continue;
    const slogan = b.kind === "slogan" ? String(p.slogan ?? b.slogans?.[0] ?? "").trim().slice(0, 60) : undefined;
    if (b.kind === "slogan" && !slogan) continue;
    chosen.push({ id: b.id, kind: b.kind, title: b.title, artHint: b.artHint, listingHint: b.listingHint, slogan });
  }
  const custom = typeof data?.custom === "string" ? data.custom.trim().slice(0, 300) : "";
  if (custom) chosen.push({ id: "own", kind: isSheetFormat(formatOf(product)) ? "feature" : "art", title: "Your idea", artHint: custom, listingHint: custom });
  const slogan = chosen.find((c) => c.kind === "slogan")?.slogan;
  return { productData: { boosters: chosen, slogan: slogan ?? null } };
}

/** Image prompt with your chosen art boosters woven in. Slogans are added as real text by the Printer instead. */
export function boostedPrompt(base: string, boosters: ChosenBooster[] | undefined): string {
  const hints = (boosters ?? []).filter((b) => b.artHint && b.kind !== "slogan").map((b) => b.artHint);
  return hints.length ? `${base}. Also: ${hints.join("; ")}` : base;
}

// ───────────── Designer: generate the art, one image per tick ─────────────

async function generateArt(ctx: RealContext): Promise<StepResult | PartialResult> {
  const brief = d(ctx.product).brief;
  if (!brief) throw new Error("No brief yet — the Analyst needs to finish first.");
  const done = ((ctx.task.output as { images?: ArtImage[] } | null)?.images ?? []).slice();
  const i = done.length;
  const prompt = boostedPrompt(brief.imagePrompts[i % brief.imagePrompts.length], d(ctx.product).boosters);
  const b64 = await ctx.ai.image(prompt);
  // Stored as base64 text: decoding happens in your browser, which keeps the
  // Worker well inside the free plan's 10 ms CPU limit.
  const key = `products/${ctx.product.id}/art-${i + 1}-${Date.now().toString(36)}.b64`;
  await ctx.files.put(key, b64, { httpMetadata: { contentType: "text/plain" }, customMetadata: { kind: "art", mime: "image/jpeg" } });
  done.push({ key, prompt });
  if (done.length < IMAGES_PER_PRODUCT) {
    return { partial: { provider: "workers-ai", images: done }, progress: done.length / IMAGES_PER_PRODUCT, log: `Painted image ${done.length} of ${IMAGES_PER_PRODUCT}` };
  }
  return { output: { provider: "workers-ai", images: done }, productData: { images: done }, log: `Generated ${done.length} artworks` };
}

// ───────────── Inspector: you swipe; the free plan has no vision check ─────────────

async function inspectArt(ctx: RealContext): Promise<StepResult> {
  const images = d(ctx.product).images ?? [];
  return {
    output: {
      images: images.map((im) => ({ key: im.key, prompt: im.prompt, score: null, issues: [] })),
      note: "Free mode doesn't auto-check images. Look closely for odd hands, faces, blurry patches or stray letters before you keep one.",
    },
    log: `Lined up ${images.length} images for your review`,
  };
}

function keepImages(task: TaskRow, product: ProductRow, data: Record<string, unknown> | undefined) {
  const all = (d(product).images ?? []).map((i) => i.key);
  const kept = Array.isArray(data?.kept) ? (data!.kept as unknown[]).filter((k): k is string => typeof k === "string" && all.includes(k)) : [];
  if (!task.demo && all.length && kept.length === 0) return { error: "Keep at least one image (swipe right), or ask for new art." };
  return { productData: kept.length ? { keptImages: kept } : {} };
}

// ───────────── Printer: plans the files; your device builds them ─────────────

async function planPrint(ctx: RealContext): Promise<StepResult> {
  const kept = d(ctx.product).keptImages ?? [];
  return {
    output: { sizes: PRINT_SIZES_REAL, images: kept, dpi: 300, buildInBrowser: true, slogan: d(ctx.product).slogan ?? null },
    log: `Ready to build ${PRINT_SIZES_REAL.length} print sizes from ${kept.length} image(s). Tap to build on your device`,
  };
}

function acceptPrintFiles(_task: TaskRow, product: ProductRow, data: Record<string, unknown> | undefined) {
  const zipKey = typeof data?.zipKey === "string" ? data.zipKey : "";
  if (!zipKey.startsWith(`products/${product.id}/`)) return { error: "Build the print files first (tap “Build print files”)." };
  const files = Array.isArray(data?.files) ? (data!.files as unknown[]).filter((f): f is string => typeof f === "string").slice(0, 50) : [];
  const zip = zipKey.split("/").pop()!;
  return { productData: { zipKey, files, zip } };
}


// ───────────── Analyst: spreadsheet / printable tracker design ─────────────

const sheetBriefSchema = z.object({
  productTitle: z.string(),
  audience: z.string(),
  style: z.string(),
  palette: z.array(z.string()),
  sheet: z.record(z.string(), z.unknown()),
  boosters: briefSchema.shape.boosters,
});

const BOOSTER_JSON = {
  type: "array",
  items: {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["feature", "bundle", "listing"] },
      title: { type: "string" },
      why: { type: "string" },
      artHint: { type: "string" },
      listingHint: { type: "string" },
    },
    required: ["kind", "title", "why"],
  },
};

function sheetPrompt(f: ProductFormat) {
  return f === "excel"
    ? "Design a ready-made spreadsheet that does the maths for the buyer: inputs they type once, tabs they fill in, and a Summary dashboard of totals."
    : "Design a printable tracker the buyer prints and fills in by hand: clear columns, plenty of empty rows, checkboxes where useful. Keep summary lines simple (they're printed as boxes to fill in).";
}

async function writeSheetBrief(ctx: RealContext): Promise<StepResult> {
  const data = d(ctx.product);
  const format = formatOf(ctx.product);
  const idea = data.suggestion?.idea ?? ctx.product.niche;
  const report = data.report;
  const b = await ctx.ai.json({
    system: `${SHOP_CONTEXT} You are Analyst, an expert at designing beautiful, easy-to-use spreadsheets and printable trackers that sell on Etsy.`,
    prompt: `Idea: ${idea}\n${formatLine(format)}\n${data.suggestion?.notes ? `Owner's notes: ${data.suggestion.notes}\n` : ""}${report ? `Scout's angles: ${report.angles.join("; ")}\n` : ""}${sheetPrompt(format)}\nWrite: a short product title (under 50 characters), the target audience, the look and feel, a palette of 5 hex colours (the first is the header colour), and "sheet": the design (title, subtitle, currency symbol, accent hex colour, howTo: 3-6 short steps for the buyer, inputs, summary, tabs).\n${SHEET_RULES}\nThen think like a shop owner who wants this to outsell competitors: suggest 3-5 "boosters" the owner can switch on: kind "feature" (an extra tab, column or dashboard line, with artHint describing exactly what to add), "bundle" (e.g. both Excel and PDF, a matching set, with listingHint) or "listing" (e.g. gift angle, with listingHint). Each with a one-sentence why.`,
    schema: sheetBriefSchema,
    jsonSchema: {
      type: "object",
      properties: {
        productTitle: { type: "string" },
        audience: { type: "string" },
        style: { type: "string" },
        palette: { type: "array", items: { type: "string" } },
        sheet: SHEET_JSON_SCHEMA,
        boosters: BOOSTER_JSON,
      },
      required: ["productTitle", "audience", "style", "palette", "sheet", "boosters"],
    },
    maxTokens: 2200,
  });
  const palette = b.palette.filter((c) => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 5);
  const productTitle = b.productTitle.trim().slice(0, 60) || idea;
  const { spec, dropped } = tidySheetSpec({ ...(b.sheet as RawSpec), accent: (b.sheet as RawSpec).accent ?? palette[0] }, productTitle);
  const boosters = tidyBoosters(b.boosters, idea, format);
  const brief: Brief = { productTitle, audience: b.audience.trim(), style: b.style.trim(), palette, imagePrompts: [] };
  return {
    output: { productType: FORMAT_INFO[format].long, format, ...brief, sheet: spec, checks: dropped, included: includedLine(format), boosters },
    productData: { brief, palette, audience: brief.audience, sheet: spec },
    productTitle,
    log: `Designed “${productTitle}”: ${spec.tabs.length} tab${spec.tabs.length === 1 ? "" : "s"}, ${spec.summary.length} summary lines, with ${boosters.length} ideas to make it stronger`,
  };
}

// ───────────── Printer: plan the spreadsheet; your device builds the files ─────────────

/** Weave your chosen "feature" boosters into the design (one extra AI pass), then hand it to your device to build. */
async function planSheet(ctx: RealContext): Promise<StepResult> {
  const data = d(ctx.product);
  const format = formatOf(ctx.product);
  let spec = data.sheet;
  if (!spec) throw new Error("No design yet. The Analyst needs to finish the brief first.");
  const features = (data.boosters ?? []).filter((b) => b.kind === "feature" && b.artHint);
  // "Redesign" sends the step back with your note.
  const fix = ctx.task.note?.trim() || undefined;
  let notes: string[] = [];
  if (features.length || fix) {
    const r = await ctx.ai.json({
      system: `${SHOP_CONTEXT} You are Analyst. Update a spreadsheet design, keeping everything that already works.`,
      prompt: `Current design (JSON):\n${JSON.stringify(spec)}\n${formatLine(format)}\nChanges to make:\n${features.map((f) => `- ${f.title}: ${f.artHint}`).join("\n")}${fix ? `\n- Owner's feedback: ${fix}` : ""}\nReturn the full updated design.\n${SHEET_RULES}`,
      schema: z.record(z.string(), z.unknown()),
      jsonSchema: SHEET_JSON_SCHEMA,
      maxTokens: 2200,
    });
    const tidy = tidySheetSpec(r as RawSpec, spec.title);
    spec = { ...tidy.spec, accent: spec.accent };
    notes = tidy.dropped;
  }
  return {
    output: { format, sheet: spec, checks: notes, buildInBrowser: true, included: includedLine(format) },
    productData: { sheet: spec },
    log: `Design ready: ${spec.tabs.map((t) => t.name).join(", ")}. Tap to build the ${format === "excel" ? "spreadsheet and PDF" : "PDF"} on your device`,
  };
}

function acceptSheetFiles(_task: TaskRow, product: ProductRow, data: Record<string, unknown> | undefined) {
  const zipKey = typeof data?.zipKey === "string" ? data.zipKey : "";
  if (!zipKey.startsWith(`products/${product.id}/`)) return { error: "Build the files first (tap “Build files”)." };
  const files = Array.isArray(data?.files) ? (data!.files as unknown[]).filter((f): f is string => typeof f === "string").slice(0, 50) : [];
  const previews = Array.isArray(data?.previews)
    ? (data!.previews as unknown[]).filter((k): k is string => typeof k === "string" && k.startsWith(`products/${product.id}/`)).slice(0, 10)
    : [];
  const own = (k: unknown) => (typeof k === "string" && k.startsWith(`products/${product.id}/`) ? k : undefined);
  const raw = (data?.screens ?? {}) as Record<string, unknown>;
  const screens = { table: own(raw.table), dash: own(raw.dash), page: own(raw.page) };
  return { productData: { zipKey, files, zip: zipKey.split("/").pop()!, keptImages: previews, screens } };
}

// ───────────── Stylist: mockups from your kept art ─────────────

/** A painted background for this scene: reuse one from the library, or paint a new one (one AI picture). */
async function sceneBackground(ctx: RealContext, scene: SceneDef): Promise<{ key: string | null; painted: boolean }> {
  const listed = await ctx.files.list({ prefix: `products/_scenes/${scene.id}-` });
  const keys = listed.objects.map((o) => o.key).sort();
  const want = ctx.product.seed % SCENE_VARIANTS;
  if (keys.length > want) return { key: keys[want], painted: false };
  try {
    const b64 = await ctx.ai.image(scene.prompt);
    const key = sceneKey(scene.id, keys.length);
    await ctx.files.put(key, b64, { httpMetadata: { contentType: "text/plain" }, customMetadata: { kind: "scene", mime: "image/jpeg" } });
    return { key, painted: true };
  } catch {
    // Out of free AI for today (or a hiccup): use a library picture, or a plain styled backdrop.
    return { key: keys[0] ?? null, painted: false };
  }
}

/** What to show in each scene: your kept art, or the spreadsheet / printable pictures. */
function sceneContent(data: ProductData, scene: SceneDef, i: number): string | null {
  const kept = data.keptImages ?? [];
  const screens = data.screens;
  if (screens && (screens.table || screens.page)) {
    if (scene.kind === "paper") return screens.page ?? screens.table ?? null;
    if (scene.kind === "tablet") return screens.dash ?? screens.page ?? screens.table ?? null;
    return screens.table ?? screens.page ?? null;
  }
  return kept[i % Math.max(1, kept.length)] ?? null;
}

async function styleMockups(ctx: RealContext): Promise<StepResult | PartialResult> {
  const data = d(ctx.product);
  const format = formatOf(ctx.product);
  const scenes = scenesFor(format);
  const slogan = isSheetFormat(format) ? null : (data.slogan ?? null);
  const done = ((ctx.task.output as { mockups?: MockupView[] } | null)?.mockups ?? []).slice();
  // Fill scenes in order; stop after painting one new background so each tick stays small.
  while (done.length < scenes.length) {
    const i = done.length;
    const scene = scenes[i];
    const bg = await sceneBackground(ctx, scene);
    done.push({ scene: scene.id, seed: ctx.product.seed * 10 + i, bgKey: bg.key, imageKey: sceneContent(data, scene, i), slogan });
    if (bg.painted && done.length < scenes.length) {
      return { partial: { mockups: done }, progress: done.length / scenes.length, log: `Painted the ${scene.label.toLowerCase()} scene` };
    }
  }
  return { output: { mockups: done }, productData: { mockups: done }, log: `Staged ${done.length} photo mockups` };
}

// ───────────── Copywriter: title, tags, description ─────────────

const DISCLOSURE = "This design was created with AI assistance and carefully checked by hand.";

const FORMAT_TAGS: Record<ProductFormat, string[]> = {
  art: ["digital download", "printable", "instant download", "wall art", "gift idea"],
  excel: ["excel template", "google sheets", "spreadsheet", "digital download", "instant download"],
  pdf: ["printable", "digital download", "instant download", "printable planner", "pdf"],
};

const HOW_IT_WORKS: Record<ProductFormat, string> = {
  art: "This is a digital download: no physical item will be shipped. Print at home, at a local print shop, or online.",
  excel:
    "This is a digital download: no physical item will be shipped. Open the .xlsx file in Microsoft Excel, or upload it to Google Sheets (File → Import) or Apple Numbers. Type in the white cells; the shaded cells and totals work themselves out. The PDF version can be printed at home.",
  pdf: "This is a digital download: no physical item will be shipped. Print at home on A4 or US Letter paper, or at a local print shop, and fill it in by hand.",
};

export function tidyListing(raw: { title: string; tags: string[]; description: string }, blocklist: string[], format: ProductFormat = "art") {
  let title = raw.title.replace(/\s+/g, " ").trim();
  for (const t of blockedTermsIn(title, blocklist)) title = title.replace(new RegExp(t, "ig"), "").replace(/\s+/g, " ").trim();
  title = title.slice(0, ETSY_LIMITS.titleMax).trim();
  const tags = cleanKeywords([...raw.tags, ...FORMAT_TAGS[format]]).filter(
    (t) => blockedTermsIn(t, blocklist).length === 0,
  );
  let description = raw.description.replace(/\r/g, "").trim();
  if (!hasAiDisclosure(description)) description = `${DISCLOSURE}\n\n${description}`;
  if (!/digital download/i.test(description)) description += `\n\nHOW IT WORKS\n${HOW_IT_WORKS[format]}`;
  return { title, tags: tags.slice(0, ETSY_LIMITS.tagsMax), description, designedBy: "seller" as const };
}

async function writeListing(ctx: RealContext): Promise<StepResult> {
  const data = d(ctx.product);
  const brief = data.brief;
  const keywords = [...(data.report?.keywords ?? []), ...cleanKeywords(ctx.product.niche.split(/\s+/))];
  const format = formatOf(ctx.product);
  const sheet = data.sheet;
  const sheetLine = sheet
    ? `Tabs: ${["Summary", ...sheet.tabs.map((t) => `${t.name} (${t.columns.map((c) => c.header).join(", ")})`)].join("; ")}.\nSummary shows: ${sheet.summary.map((x) => x.label).join(", ") || "totals"}.\n`
    : "";
  const r = await ctx.ai.json({
    system: `${SHOP_CONTEXT} You are Copywriter. Tone of voice: ${ctx.settings.toneOfVoice}`,
    prompt: `Write an Etsy listing for a digital download.\n${formatLine(format)}\nProduct: ${ctx.product.title}\nIdea: ${ctx.product.niche}\n${brief ? `Audience: ${brief.audience}\nStyle: ${brief.style}\n` : ""}${sheetLine}${data.slogan && !isSheetFormat(format) ? `The print features the slogan: "${data.slogan}"\n` : ""}${(data.boosters ?? []).filter((b) => b.listingHint).map((b) => `Highlight: ${b.listingHint}\n`).join("")}Included: ${includedLine(format)}.\nUseful keywords: ${keywords.join(", ")}\nRules: title under 140 characters, front-load the main keyword, no brand or character names${format === "excel" ? ", say it works in Excel and Google Sheets" : ""}. Exactly 13 tags, each under 20 characters. Description: first sentence must say it was created with AI assistance; then what it is, what's included, how to use it, and a friendly note.${format === "excel" ? " Don't promise financial results or give financial advice." : ""} No emojis in the title.`,
    schema: z.object({ title: z.string(), tags: z.array(z.string()), description: z.string() }),
    jsonSchema: {
      type: "object",
      properties: { title: { type: "string" }, tags: { type: "array", items: { type: "string" } }, description: { type: "string" } },
      required: ["title", "tags", "description"],
    },
    maxTokens: 1400,
  });
  const listing = tidyListing(r, ctx.settings.blocklist, format);
  return { output: listing, productData: { listing }, log: `Wrote title, ${listing.tags.length} tags and description` };
}

/** Real versions of the pipeline steps. Applied in index.ts. */
export const REAL_STEPS: Record<string, Partial<StepDef>> = {
  niche_score: {
    realSeconds: 15,
    real: async (ctx) => {
      const sug = d(ctx.product).suggestion;
      const report = await researchIdeaWithAi(ctx, sug?.idea ?? ctx.product.niche, sug?.notes);
      return {
        output: { ...report, niche: report.idea, suggested: !!sug },
        productData: { report },
        log: `Researched “${report.idea}”: ${report.verdict.toUpperCase()} (${report.overall}/10)`,
      };
    },
  },
  // Analyst pitches boosters, so you get a say before any art is made.
  brief: { realSeconds: 20, real: writeBrief, needsApproval: (p) => !p.demo, onApprove: (t, p, data) => (p.demo ? {} : chooseBoosters(t, p, data)) },
  images: { realSeconds: 40, real: generateArt },
  inspect: { realSeconds: 1, real: inspectArt, onApprove: keepImages },
  print_files: {
    realSeconds: 1,
    real: planPrint,
    // Real print files are built in your browser, so you approve this step by building them.
    needsApproval: (p) => !p.demo,
    onApprove: (t, p, data) => (p.demo ? {} : acceptPrintFiles(t, p, data)),
  },
  sheet_build: {
    realSeconds: 15,
    real: planSheet,
    // The files are built in your browser, so you approve this step by building them.
    needsApproval: true,
    onApprove: (t, p, data) => acceptSheetFiles(t, p, data),
  },
  mockups: { realSeconds: 25, real: styleMockups },
  copy: { realSeconds: 20, real: writeListing },
};
