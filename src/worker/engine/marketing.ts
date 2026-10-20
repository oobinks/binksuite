// Promoter: Pinterest pin copy for finished products, and a 7-day content calendar.
// Drafts only. Nothing here posts anywhere; the owner downloads, copies and posts.
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "../db";
import { products } from "../db/schema";
import { kvGet, kvSet, nowIso } from "../lib/store";
import type { AiServices } from "../providers/ai";
import { formatOf, type ProductFormat } from "../../shared/format";

const PROMOTER_CONTEXT =
  "You are Promoter, the marketing helper for a small UK Etsy shop selling digital downloads: wall art prints, printable planners and trackers (PDF), and ready-made spreadsheets (Excel, which also open in Google Sheets). Use British spelling. Be warm, clear and honest. Never invent statistics, reviews or sales figures. Never mention brands, characters or celebrities. No fake discounts or 'was/now' prices.";

export const CHANNELS = ["Pinterest", "Instagram", "TikTok"] as const;
export type Channel = (typeof CHANNELS)[number];

// ───────────── Products worth promoting ─────────────

interface ProductData {
  listing?: { title: string; tags: string[]; description: string };
  keptImages?: string[];
  palette?: string[];
  etsy?: { listingId?: number; editUrl?: string; url?: string };
  etsyLive?: { state?: string; url?: string };
}

export interface PinCopy {
  titles: string[];
  description: string;
  boards: string[];
  at: string;
  real: boolean;
  rev: number;
}

export interface PinRecord {
  copy: PinCopy | null;
  /** When the owner said they'd added it to Pinterest. */
  pinnedAt: string | null;
  /** A rewrite waiting on Claude's session. */
  pendingRev?: number | null;
}

export interface PromoProduct {
  id: string;
  title: string;
  stage: string;
  format: ProductFormat;
  pricePence: number | null;
  listing: { title: string; tags: string[]; description: string };
  images: string[];
  accent: string | null;
  live: boolean;
  url: string | null;
  pins: PinRecord;
}

export const pinsKey = (productId: string) => `pins:${productId}`;
const EMPTY_PINS: PinRecord = { copy: null, pinnedAt: null, pendingRev: null };

/** The live Etsy page, when known. */
function liveUrl(d: ProductData): string | null {
  if (d.etsyLive?.state === "active" && d.etsyLive.url) return d.etsyLive.url;
  if (d.etsy?.url && /^https:\/\//.test(d.etsy.url)) return d.etsy.url;
  return null;
}

/** Real (non-demo) products with a listing and listing photos. Live ones first. */
export async function promotableProducts(db: DB): Promise<PromoProduct[]> {
  const rows = await db.select().from(products).where(eq(products.demo, false)).orderBy(desc(products.updatedAt)).all();
  const out: PromoProduct[] = [];
  for (const p of rows) {
    const d = p.data as ProductData;
    if (!d.listing?.title || !d.keptImages?.length) continue;
    const url = liveUrl(d);
    const accent = d.palette?.find((c) => /^#[0-9a-f]{6}$/i.test(c)) ?? null;
    out.push({
      id: p.id,
      title: p.title,
      stage: p.stage,
      format: formatOf(p),
      pricePence: p.pricePence,
      listing: { title: d.listing.title, tags: d.listing.tags ?? [], description: d.listing.description ?? "" },
      images: d.keptImages,
      accent,
      live: p.stage === "live" || d.etsyLive?.state === "active",
      url,
      pins: { ...EMPTY_PINS, ...((await kvGet<PinRecord>(db, pinsKey(p.id))) ?? {}) },
    });
  }
  return out.sort((a, b) => Number(b.live) - Number(a.live));
}

export async function promotableProduct(db: DB, id: string): Promise<PromoProduct | null> {
  const p = await db.select({ id: products.id }).from(products).where(and(eq(products.id, id), eq(products.demo, false))).get();
  if (!p) return null;
  return (await promotableProducts(db)).find((x) => x.id === id) ?? null;
}

// ───────────── Small text helpers ─────────────

/** A short, stable fingerprint of some text (for idempotent AI keys). */
export function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}

/** Cut text to `max` characters on a word boundary. */
export function cut(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const slice = t.slice(0, max - 1);
  const sp = slice.lastIndexOf(" ");
  return `${(sp > max * 0.6 ? slice.slice(0, sp) : slice).replace(/[\s,;:.|-]+$/, "")}…`;
}

const hashtagOf = (s: string) => `#${s.replace(/[^a-z0-9]/gi, "").toLowerCase()}`;

/** Description up to 500 characters with no more than 5 hashtags, all at the end. */
export function tidyDescription(raw: string, fallbackTags: string[] = []): string {
  const found = [...raw.matchAll(/#([\p{L}\p{N}_]+)/gu)].map((m) => `#${m[1].toLowerCase()}`);
  let tags = [...new Set(found)].slice(0, 5);
  if (!tags.length) tags = [...new Set(fallbackTags.map(hashtagOf).filter((t) => t.length > 2))].slice(0, 3);
  const body = raw.replace(/#[\p{L}\p{N}_]+/gu, "").replace(/[ \t]+/g, " ").replace(/\s+([.,!?])/g, "$1").trim();
  let tail = tags.join(" ");
  while (tail.length > 120) tail = tail.split(" ").slice(0, -1).join(" ");
  const room = 500 - (tail ? tail.length + 2 : 0);
  return tail ? `${cut(body, room)}\n\n${tail}` : cut(body, 500);
}

// ───────────── Pin copy ─────────────

const pinSchema = z.object({ titles: z.array(z.string()).min(1), description: z.string(), boards: z.array(z.string()).default([]) });

const FORMAT_WORDS: Record<ProductFormat, string> = {
  art: "printable wall art (instant download)",
  excel: "ready-made spreadsheet (Excel + Google Sheets, instant download)",
  pdf: "printable planner / tracker PDF (instant download)",
};

function tidyPins(raw: z.infer<typeof pinSchema>, p: PromoProduct, real: boolean, rev: number): PinCopy {
  const titles = [...new Set(raw.titles.map((t) => cut(t.replace(/#\S+/g, ""), 100)).filter(Boolean))].slice(0, 3);
  while (titles.length < 3) titles.push(cut([p.listing.title.split("|")[0], "Instant Download", "Printable"][titles.length] ?? p.title, 100));
  const boards = [...new Set(raw.boards.map((b) => cut(b.replace(/#/g, ""), 50)).filter(Boolean))].slice(0, 4);
  return { titles, description: tidyDescription(raw.description, p.listing.tags), boards: boards.length ? boards : fallbackBoards(p), at: nowIso(), real, rev };
}

function fallbackBoards(p: PromoProduct): string[] {
  if (p.format === "excel") return ["Budget Spreadsheets", "Home Organisation Ideas", "Money Saving Tips"];
  if (p.format === "pdf") return ["Printable Planners", "Get Organised", "Free Time Ideas"];
  return ["Printable Wall Art", "Gallery Wall Ideas", "Cosy Home Decor"];
}

/** Template copy for when real AI is switched off. */
function simplePins(p: PromoProduct): z.infer<typeof pinSchema> {
  const name = p.listing.title.split(/[|,–-]/)[0].trim() || p.title;
  const tags = p.listing.tags.slice(0, 5);
  const firstLine = p.listing.description.split(/\n|(?<=\.)\s/)[0] ?? "";
  return {
    titles: [name, `${name} | Instant Download`, `${name} – ${p.format === "art" ? "Printable Wall Art" : p.format === "excel" ? "Ready-Made Spreadsheet" : "Printable PDF"}`],
    description: `${firstLine} ${tags.length ? `Lovely for anyone looking for ${tags.slice(0, 3).join(", ")}.` : ""} Instant download from our Etsy shop.`.trim(),
    boards: fallbackBoards(p),
  };
}

function pinRequest(p: PromoProduct, rev: number) {
  return {
    key: `pins:${p.id}:${fingerprint(p.listing.title + p.listing.tags.join(","))}:${rev}`,
    label: `Pinterest pin copy: ${p.title}`,
    system: `${PROMOTER_CONTEXT} You write Pinterest pins that read naturally and help people find the product in Pinterest search.`,
    prompt: `Write Pinterest pin copy for this Etsy product.\nProduct: ${p.listing.title}\nWhat it is: ${FORMAT_WORDS[p.format]}\nEtsy tags: ${p.listing.tags.join(", ") || "(none)"}\nListing description:\n${p.listing.description.slice(0, 1200)}\n\nWrite:\n- "titles": 3 different pin title options, each under 100 characters, clear and searchable, no hashtags, no emoji.\n- "description": one pin description under 450 characters, natural sentences that weave in the most relevant keywords from the tags (no keyword lists), then 3 to 5 relevant hashtags at the very end. No hashtags in the middle, no emoji.\n- "boards": 3 suggested Pinterest board names to save it to.${rev > 0 ? `\nThis is rewrite number ${rev}: take a fresh angle, different from before.` : ""}`,
    schema: pinSchema,
    jsonSchema: {
      type: "object",
      properties: {
        titles: { type: "array", items: { type: "string" } },
        description: { type: "string" },
        boards: { type: "array", items: { type: "string" } },
      },
      required: ["titles", "description", "boards"],
    },
    maxTokens: 700,
  };
}

/**
 * Write (or rewrite) pin copy and save it. Throws the provider's errors (incl. Claude pending);
 * the caller records a pending rewrite with `markPinsPending`.
 */
export async function writePins(db: DB, ai: AiServices | null, p: PromoProduct, rewrite: boolean): Promise<PinCopy> {
  const rev = p.pins.pendingRev ?? (p.pins.copy ? (rewrite ? p.pins.copy.rev + 1 : p.pins.copy.rev) : 0);
  if (p.pins.copy && !rewrite && p.pins.pendingRev == null) return p.pins.copy;
  const copy = ai ? tidyPins(await ai.json(pinRequest(p, rev)), p, true, rev) : tidyPins(simplePins(p), p, false, rev);
  await kvSet(db, pinsKey(p.id), { ...p.pins, copy, pendingRev: null } satisfies PinRecord);
  return copy;
}

export async function markPinsPending(db: DB, p: PromoProduct, rewrite: boolean): Promise<void> {
  const rev = p.pins.pendingRev ?? (p.pins.copy ? (rewrite ? p.pins.copy.rev + 1 : p.pins.copy.rev) : 0);
  await kvSet(db, pinsKey(p.id), { ...p.pins, pendingRev: rev } satisfies PinRecord);
}

export async function setPinned(db: DB, productId: string, pinned: boolean): Promise<PinRecord> {
  const cur = { ...EMPTY_PINS, ...((await kvGet<PinRecord>(db, pinsKey(productId))) ?? {}) };
  const next = { ...cur, pinnedAt: pinned ? nowIso() : null };
  await kvSet(db, pinsKey(productId), next);
  return next;
}

// ───────────── Content calendar ─────────────

export const CALENDAR_KEY = "marketingCalendar";

export interface CalendarDay {
  date: string;
  channel: Channel;
  productId: string | null;
  productTitle: string | null;
  idea: string;
  caption: string;
  done: boolean;
}

export interface Calendar {
  weekStart: string;
  at: string;
  real: boolean;
  rev: number;
  days: CalendarDay[];
  /** A re-plan waiting on Claude's session. */
  pendingRev?: number | null;
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Monday of the week to plan: today if it's Monday, otherwise next Monday. */
export function planWeekStart(now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = d.getUTCDay(); // 0 Sun … 6 Sat
  const add = dow === 1 ? 0 : (8 - dow) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + add);
  return isoDay(d);
}

export function weekDates(weekStart: string): string[] {
  const start = new Date(`${weekStart}T00:00:00Z`);
  return Array.from({ length: 7 }, (_, i) => isoDay(new Date(start.getTime() + i * 86_400_000)));
}

const calendarSchema = z.object({
  days: z
    .array(z.object({ day: z.number().optional(), channel: z.string(), productId: z.string().nullable().optional(), idea: z.string(), caption: z.string() }))
    .min(1),
});

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function calendarRequest(list: PromoProduct[], weekStart: string, rev: number) {
  const lines = list.slice(0, 12).map((p) => `- id ${p.id}: ${p.listing.title} (${FORMAT_WORDS[p.format]}${p.live ? ", live on Etsy" : ", not live yet"}). Tags: ${p.listing.tags.slice(0, 8).join(", ")}`);
  return {
    key: `calendar:${weekStart}:${fingerprint(list.map((p) => p.id).join(","))}:${rev}`,
    label: `Content calendar: week of ${weekStart}`,
    system: `${PROMOTER_CONTEXT} You plan simple, doable social posts for a one-person shop.`,
    prompt: `Plan one post a day for the week starting Monday ${weekStart} (7 days, Monday to Sunday), spread across Pinterest, Instagram and TikTok (use each at least twice). Favour products that are live on Etsy.\nProducts (use the exact id):\n${lines.join("\n")}\n\nFor each day give: "day" (1 = Monday … 7 = Sunday), "channel" (exactly "Pinterest", "Instagram" or "TikTok"), "productId" (one id from the list), "idea" (one short sentence: what to post, e.g. a close-up video, a flat lay, a 'how it works' screen recording), and "caption" (a ready-to-post caption under 300 characters suited to the channel, at most 5 hashtags at the end, no emoji spam).${rev > 0 ? " This is a re-plan: use fresh ideas." : ""}`,
    schema: calendarSchema,
    jsonSchema: {
      type: "object",
      properties: {
        days: {
          type: "array",
          items: {
            type: "object",
            properties: { day: { type: "number" }, channel: { type: "string", enum: [...CHANNELS] }, productId: { type: "string" }, idea: { type: "string" }, caption: { type: "string" } },
            required: ["day", "channel", "productId", "idea", "caption"],
          },
        },
      },
      required: ["days"],
    },
    maxTokens: 1800,
  };
}

function simpleCalendar(list: PromoProduct[]): z.infer<typeof calendarSchema> {
  const ideas: Record<Channel, (p: PromoProduct) => [string, string]> = {
    Pinterest: (p) => [`Pin a listing photo of ${p.title} with a link to the shop.`, `${p.listing.title.split("|")[0].trim()} – instant download, ready in minutes.`],
    Instagram: (p) => [`Share a tidy flat lay or screen shot of ${p.title}.`, `New in the shop: ${p.title}. Download, print or open it today. Link in bio.`],
    TikTok: (p) => [`Film a short scroll-through of ${p.title}, showing what's inside.`, `Here's what you get with ${p.title} – link in bio.`],
  };
  return {
    days: DAY_NAMES.map((_, i) => {
      const channel = CHANNELS[i % 3];
      const p = list[i % list.length];
      const [idea, caption] = ideas[channel](p);
      return { day: i + 1, channel, productId: p.id, idea, caption };
    }),
  };
}

function tidyCalendar(raw: z.infer<typeof calendarSchema>, list: PromoProduct[], weekStart: string, real: boolean, rev: number): Calendar {
  const dates = weekDates(weekStart);
  const byDay = new Map<number, (typeof raw.days)[number]>();
  raw.days.forEach((d, i) => {
    const n = d.day && d.day >= 1 && d.day <= 7 ? d.day : i + 1;
    if (!byDay.has(n)) byDay.set(n, d);
  });
  const fill = simpleCalendar(list).days;
  const days: CalendarDay[] = dates.map((date, i) => {
    const d = byDay.get(i + 1) ?? fill[i];
    const channel = (CHANNELS.find((c) => c.toLowerCase() === d.channel.trim().toLowerCase()) ?? CHANNELS[i % 3]) as Channel;
    const p = list.find((x) => x.id === d.productId) ?? list[i % list.length];
    return { date, channel, productId: p.id, productTitle: p.title, idea: cut(d.idea, 200), caption: cut(d.caption, 600), done: false };
  });
  return { weekStart, at: nowIso(), real, rev, days, pendingRev: null };
}

export async function getCalendar(db: DB): Promise<Calendar | null> {
  return kvGet<Calendar>(db, CALENDAR_KEY);
}

/** Make the week's plan. `replan` asks for fresh ideas. Throws provider errors (incl. Claude pending). */
export async function planWeek(db: DB, ai: AiServices | null, list: PromoProduct[], replan: boolean, now: Date = new Date()): Promise<Calendar> {
  const cur = await getCalendar(db);
  const weekStart = planWeekStart(now);
  const sameWeek = cur?.weekStart === weekStart;
  const rev = cur?.pendingRev ?? (sameWeek ? (replan ? cur!.rev + 1 : cur!.rev) : 0);
  if (cur && sameWeek && !replan && cur.pendingRev == null) return cur;
  const cal = ai ? tidyCalendar(await ai.json(calendarRequest(list, weekStart, rev)), list, weekStart, true, rev) : tidyCalendar(simpleCalendar(list), list, weekStart, false, rev);
  await kvSet(db, CALENDAR_KEY, cal);
  return cal;
}

export async function markCalendarPending(db: DB, replan: boolean, now: Date = new Date()): Promise<void> {
  const cur = await getCalendar(db);
  const weekStart = planWeekStart(now);
  const sameWeek = cur?.weekStart === weekStart;
  const rev = cur?.pendingRev ?? (sameWeek ? (replan ? cur!.rev + 1 : cur!.rev) : 0);
  // Keep showing the old plan while the new one is on Claude's list.
  await kvSet(db, CALENDAR_KEY, cur ? { ...cur, pendingRev: rev } : { weekStart, at: nowIso(), real: true, rev, days: [], pendingRev: rev });
}

export async function tickDay(db: DB, date: string, done: boolean): Promise<Calendar | null> {
  const cal = await getCalendar(db);
  if (!cal) return null;
  const day = cal.days.find((d) => d.date === date);
  if (!day) return null;
  day.done = done;
  await kvSet(db, CALENDAR_KEY, cal);
  return cal;
}
