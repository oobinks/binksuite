// Real agents (Phase 2) — powered by Cloudflare's free Workers AI.
// Each entry upgrades a pipeline step for real (non-demo) products.
// Demo products keep using the canned handlers in index.ts.
import { z } from "zod";
import { blockedTermsIn, ETSY_LIMITS, hasAiDisclosure } from "../../../shared/compliance";
import type { MarketReport, Verdict } from "./marketResearch";
import type { PartialResult, ProductRow, RealContext, StepDef, StepResult, TaskRow } from "./types";

export const IMAGES_PER_PRODUCT = 4;
export const PRINT_SIZES_REAL = ["A5", "A4", "A3", "US Letter", "8x10"] as const;

const AI_NOTE = "AI estimate from general knowledge. The free Cloudflare AI can't browse the web, so double-check big decisions on Etsy yourself.";

interface ProductData {
  suggestion?: { idea: string; notes?: string };
  report?: MarketReport;
  brief?: Brief;
  images?: ArtImage[];
  keptImages?: string[];
  listing?: { title: string; tags: string[]; description: string; designedBy: "seller" };
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
  "You work for a small UK Etsy shop that sells AI-assisted digital printables (wall art, planners, cards, labels). Buyers download and print them. Use British spelling. Be honest and practical; never invent statistics or name real competitor shops.";

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

export async function researchIdeaWithAi(ctx: RealContext, idea: string, notes?: string): Promise<MarketReport> {
  const r = await ctx.ai.json({
    system: `${SHOP_CONTEXT} You are Scout, a market researcher. Score each 1-10. For competition, 10 means extremely crowded.`,
    prompt: `Assess this product idea for the shop.\nIdea: ${idea}\n${notes ? `Owner's notes: ${notes}\n` : ""}Give: scores, a 1-2 sentence summary, exactly 3 reasons, risks (trademarks, seasonality, hard-to-make details), 3 specific angles to stand out, 8 Etsy search keywords (each under 20 characters), a typical price range in GBP for similar digital downloads, and when it sells best.`,
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
  const lo = Math.max(99, Math.round(Math.min(r.priceLowGBP, r.priceHighGBP) * 100));
  const hi = Math.max(lo + 100, Math.round(Math.max(r.priceLowGBP, r.priceHighGBP) * 100));
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
    sources: AI_NOTE,
  };
}

// ───────────── Scout: "suggest ideas for me" ─────────────

const ideasSchema = z.object({ ideas: z.array(z.object({ idea: z.string(), why: z.string() })).min(1) });

export async function brainstormIdeas(ai: RealContext["ai"], theme: string | undefined, avoid: string[]) {
  const r = await ai.json({
    system: `${SHOP_CONTEXT} You are Scout. Suggest specific, sellable niches, not generic categories.`,
    prompt: `Suggest 5 digital printable product ideas${theme ? ` around: ${theme}` : " that suit the coming season"}. Avoid brands, characters and celebrities.${avoid.length ? ` Don't repeat: ${avoid.slice(0, 20).join("; ")}.` : ""} Each idea under 60 characters with a one-sentence reason.`,
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
});

async function writeBrief(ctx: RealContext): Promise<StepResult> {
  const data = d(ctx.product);
  const idea = data.suggestion?.idea ?? ctx.product.niche;
  const report = data.report;
  const b = await ctx.ai.json({
    system: `${SHOP_CONTEXT} You are Analyst. Turn an approved idea into a product brief and image-generation prompts.`,
    prompt: `Idea: ${idea}\n${data.suggestion?.notes ? `Owner's notes: ${data.suggestion.notes}\n` : ""}${report ? `Scout's angles: ${report.angles.join("; ")}\n` : ""}Write: a short product title (under 50 characters), the target audience, the art style, a palette of 5 hex colours, and ${IMAGES_PER_PRODUCT} different image prompts for a text-to-image model. Prompts must describe printable artwork only: no words, letters or watermarks in the image, no brands or characters, plain composition suitable for framing.`,
    schema: briefSchema,
    jsonSchema: {
      type: "object",
      properties: {
        productTitle: { type: "string" },
        audience: { type: "string" },
        style: { type: "string" },
        palette: { type: "array", items: { type: "string" } },
        imagePrompts: { type: "array", items: { type: "string" } },
      },
      required: ["productTitle", "audience", "style", "palette", "imagePrompts"],
    },
  });
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
    output: { productType: "Digital printable", ...brief, sizes: PRINT_SIZES_REAL },
    productData: { brief, palette: brief.palette, audience: brief.audience },
    productTitle: brief.productTitle,
    log: `Brief ready for “${brief.productTitle}” → off to the Studio`,
  };
}

// ───────────── Designer: generate the art, one image per tick ─────────────

async function generateArt(ctx: RealContext): Promise<StepResult | PartialResult> {
  const brief = d(ctx.product).brief;
  if (!brief) throw new Error("No brief yet — the Analyst needs to finish first.");
  const done = ((ctx.task.output as { images?: ArtImage[] } | null)?.images ?? []).slice();
  const i = done.length;
  const prompt = brief.imagePrompts[i % brief.imagePrompts.length];
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
    output: { sizes: PRINT_SIZES_REAL, images: kept, dpi: 300, buildInBrowser: true },
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

// ───────────── Stylist: mockups from your kept art ─────────────

async function styleMockups(ctx: RealContext): Promise<StepResult> {
  const kept = d(ctx.product).keptImages ?? [];
  const scenes = ["frame", "desk", "tablet", "gallery"];
  const mockups = scenes.map((scene, i) => ({ scene, imageKey: kept[i % Math.max(1, kept.length)] ?? null, seed: ctx.product.seed * 10 + i }));
  return { output: { mockups }, productData: { mockups }, log: `Staged ${mockups.length} mockups with your art` };
}

// ───────────── Copywriter: title, tags, description ─────────────

const DISCLOSURE = "This design was created with AI assistance and carefully checked by hand.";

export function tidyListing(raw: { title: string; tags: string[]; description: string }, blocklist: string[]) {
  let title = raw.title.replace(/\s+/g, " ").trim();
  for (const t of blockedTermsIn(title, blocklist)) title = title.replace(new RegExp(t, "ig"), "").replace(/\s+/g, " ").trim();
  title = title.slice(0, ETSY_LIMITS.titleMax).trim();
  const tags = cleanKeywords([...raw.tags, "digital download", "printable", "instant download", "wall art", "gift idea"]).filter(
    (t) => blockedTermsIn(t, blocklist).length === 0,
  );
  let description = raw.description.replace(/\r/g, "").trim();
  if (!hasAiDisclosure(description)) description = `${DISCLOSURE}\n\n${description}`;
  if (!/digital download/i.test(description)) {
    description += "\n\nHOW IT WORKS\nThis is a digital download: no physical item will be shipped. Print at home, at a local print shop, or online.";
  }
  return { title, tags: tags.slice(0, ETSY_LIMITS.tagsMax), description, designedBy: "seller" as const };
}

async function writeListing(ctx: RealContext): Promise<StepResult> {
  const data = d(ctx.product);
  const brief = data.brief;
  const keywords = [...(data.report?.keywords ?? []), ...cleanKeywords(ctx.product.niche.split(/\s+/))];
  const r = await ctx.ai.json({
    system: `${SHOP_CONTEXT} You are Copywriter. Tone of voice: ${ctx.settings.toneOfVoice}`,
    prompt: `Write an Etsy listing for a digital printable.\nProduct: ${ctx.product.title}\nIdea: ${ctx.product.niche}\n${brief ? `Audience: ${brief.audience}\nStyle: ${brief.style}\n` : ""}Sizes included: ${PRINT_SIZES_REAL.join(", ")} at 300 DPI (PDF).\nUseful keywords: ${keywords.join(", ")}\nRules: title under 140 characters, front-load the main keyword, no brand or character names. Exactly 13 tags, each under 20 characters. Description: first sentence must say it was created with AI assistance; then what it is, what's included, how to print, and a friendly note. No emojis in the title.`,
    schema: z.object({ title: z.string(), tags: z.array(z.string()), description: z.string() }),
    jsonSchema: {
      type: "object",
      properties: { title: { type: "string" }, tags: { type: "array", items: { type: "string" } }, description: { type: "string" } },
      required: ["title", "tags", "description"],
    },
    maxTokens: 1400,
  });
  const listing = tidyListing(r, ctx.settings.blocklist);
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
  brief: { realSeconds: 15, real: writeBrief },
  images: { realSeconds: 40, real: generateArt },
  inspect: { realSeconds: 1, real: inspectArt, onApprove: keepImages },
  print_files: {
    realSeconds: 1,
    real: planPrint,
    // Real print files are built in your browser, so you approve this step by building them.
    needsApproval: (p) => !p.demo,
    onApprove: (t, p, data) => (p.demo ? {} : acceptPrintFiles(t, p, data)),
  },
  mockups: { realSeconds: 1, real: styleMockups },
  copy: { realSeconds: 20, real: writeListing },
};
