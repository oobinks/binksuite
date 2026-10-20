// Customer Care (Concierge): drafts replies to buyers and to reviews, keeps your saved
// replies, and reads your shop's reviews from Etsy. It never sends anything: you copy
// each draft into Etsy yourself.
import { z } from "zod";
import type { DB } from "../db";
import { queuePush } from "./push";
import type { AiServices } from "../providers/ai";
import type { EtsyReview, ShopClient } from "../providers/etsyShop";
import { kvGet, kvSet, nowIso } from "../lib/store";
import { formatOf, type ProductFormat } from "../../shared/format";
import { formatLine, includedLine } from "./agents/real";

// ───────────── Saved replies ─────────────

export interface CareTemplate {
  id: string;
  title: string;
  body: string;
  updatedAt: string;
}

const TEMPLATES_KEY = "careTemplates";

export const DEFAULT_TEMPLATES: Omit<CareTemplate, "updatedAt">[] = [
  {
    id: "find-downloads",
    title: "Where to find your download",
    body: "Hello, thank you so much for your order! Your files are ready to download straight away. On a computer, go to Etsy, click You, then Purchases and reviews, and press Download files next to this order. In the Etsy app, downloads aren't available, so please use a web browser (on your phone or computer) instead. You'll also have had an email from Etsy with a download link. Let me know if you have any trouble and I'll be happy to help.",
  },
  {
    id: "google-sheets",
    title: "Opening the spreadsheet in Google Sheets",
    body: "Hello! The spreadsheet works in Google Sheets as well as Excel. Download the .xlsx file to your computer first, then open Google Drive, click New, then File upload, and choose the file. Once it has uploaded, double-click it and choose Open with Google Sheets. If you'd like it to stay as a Google Sheet, go to File, then Save as Google Sheets. I hope that helps!",
  },
  {
    id: "printing",
    title: "Printing sizes",
    body: "Hello, thank you for your message! The files are high resolution, so they print crisply at home or at a local print shop. Choose the file that matches your paper size, and in your printer settings pick Actual size (or 100%) rather than Fit to page, so nothing is cropped. Photo paper or a heavier matte paper gives the nicest finish. Let me know if you need a different size and I'll see what I can do.",
  },
  {
    id: "editing",
    title: "Editing the spreadsheet",
    body: "Hello! You can type straight into the white cells: the totals and charts update by themselves. The shaded cells hold the formulas, so it's best to leave those as they are. If you'd like to add more rows, insert them inside the table so the formulas carry on. If anything looks off, just let me know what you changed and I'll help you put it right.",
  },
  {
    id: "refunds",
    title: "Refunds on digital items",
    body: "Hello, thank you for getting in touch, and I'm sorry the item isn't quite what you hoped for. As it's a digital download, my shop policy doesn't usually offer returns, but I'd really like to help. Could you tell me a little more about the problem? If something isn't working, I'll do my best to fix it or send you a corrected file. You can also find more about how Etsy handles digital items in Etsy's Help Centre.",
  },
  {
    id: "file-not-opening",
    title: "File won't open",
    body: "Hello, I'm sorry you're having trouble opening the file! If it's a .zip folder, it needs to be unzipped first: on a computer, right-click it and choose Extract All (Windows) or double-click it (Mac). PDFs open in any free PDF reader, such as your web browser or Adobe Acrobat Reader. The spreadsheet opens in Excel, Google Sheets or Apple Numbers. If it still won't open, let me know what device you're using and I'll send the files another way.",
  },
];

export async function listTemplates(db: DB): Promise<CareTemplate[]> {
  const saved = await kvGet<CareTemplate[]>(db, TEMPLATES_KEY);
  if (saved) return saved;
  const at = nowIso();
  const seeded = DEFAULT_TEMPLATES.map((t) => ({ ...t, updatedAt: at }));
  await kvSet(db, TEMPLATES_KEY, seeded);
  return seeded;
}

export async function saveTemplates(db: DB, list: CareTemplate[]) {
  await kvSet(db, TEMPLATES_KEY, list);
}

// ───────────── Drafting with Concierge ─────────────

/** A short, stable hash so a draft's cache key changes when its inputs do. */
export function hashText(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(36);
}

const CARE_CONTEXT =
  "You are Concierge, customer care for a small UK Etsy shop selling digital downloads: printable wall art (PDF prints), printable planners and trackers (PDF), and ready-made spreadsheets (Excel .xlsx, which also open in Google Sheets and Apple Numbers). Nothing physical is ever posted. Buyers download their files from Etsy (You → Purchases and reviews → Download files, in a web browser rather than the Etsy app). Use British spelling. Be warm, clear and professional. Never promise refunds or make legal or policy claims; never invent facts about the product; never mention AI. No brands, characters or celebrities.";

export interface ProductFacts {
  title: string;
  format: ProductFormat;
  description?: string;
}

/** What Concierge knows about a product, from its listing. */
export function productFacts(p: { title: string; demo?: boolean; niche?: string; data?: unknown }): ProductFacts {
  const d = (p.data ?? {}) as { listing?: { title?: string; description?: string } };
  return { title: d.listing?.title || p.title, format: formatOf(p), description: d.listing?.description?.slice(0, 1500) };
}

function factsBlock(f: ProductFacts): string {
  return `The buyer's product: "${f.title}".\n${formatLine(f.format)}\nWhat's included: ${includedLine(f.format)}.${f.description ? `\nThe listing says:\n${f.description}` : ""}`;
}

const tidy = (s: string, max: number) => s.replace(/\r/g, "").trim().slice(0, max);

const replySchema = z.object({ reply: z.string().min(1) });

export interface ReplyInput {
  message: string;
  note?: string;
  product?: ProductFacts | null;
  voice: string;
  shopName: string;
  /** 0 for the first draft; higher for "Rewrite". */
  attempt?: number;
}

export async function draftReply(ai: AiServices, i: ReplyInput): Promise<string> {
  const message = tidy(i.message, 4000);
  const note = tidy(i.note ?? "", 600);
  const r = await ai.json({
    key: `care-reply:${new Date().toISOString().slice(0, 10)}:${hashText(`${message}|${note}|${i.product?.title ?? ""}`)}:${i.attempt ?? 0}`,
    label: `Reply to a buyer${i.product ? ` about ${i.product.title.slice(0, 40)}` : ""}`,
    system: `${CARE_CONTEXT} The shop is called "${i.shopName}". Tone of voice: ${i.voice}`,
    prompt: `Write a reply to this Etsy buyer message, ready for the shop owner to paste into Etsy Messages.\n\nBuyer's message:\n"""\n${message}\n"""\n\n${i.product ? `${factsBlock(i.product)}\n\n` : ""}${note ? `What the owner wants to say: ${note}\n\n` : ""}Answer their actual question accurately using only the facts above (if you don't know something, say you'll check and come back to them). Keep it under 150 words, friendly and professional, in plain text with short paragraphs. Start with a greeting; sign off simply (no placeholder names in brackets).${i.attempt ? " Write a fresh version, worded differently from before." : ""}`,
    schema: replySchema,
    jsonSchema: { type: "object", properties: { reply: { type: "string" } }, required: ["reply"] },
    maxTokens: 600,
  });
  return tidy(r.reply, 3000);
}

const responseSchema = z.object({ response: z.string().min(1) });

export interface ReviewResponseInput {
  rating: number;
  review: string;
  productTitle?: string | null;
  voice: string;
  shopName: string;
  attempt?: number;
}

/** A short public response to a review, for the owner to post on Etsy. */
export async function draftReviewResponse(ai: AiServices, i: ReviewResponseInput): Promise<string> {
  const review = tidy(i.review, 2000);
  const r = await ai.json({
    key: `care-review:${hashText(`${i.rating}|${review}|${i.productTitle ?? ""}`)}:${i.attempt ?? 0}`,
    label: `Respond to a ${i.rating}-star review`,
    system: `${CARE_CONTEXT} The shop is called "${i.shopName}". Tone of voice: ${i.voice}`,
    prompt: `Write a short public response (under 80 words) to this Etsy review. Everyone can read it, so be gracious and calm, never defensive, and don't share private details or argue.\n\nRating: ${i.rating} out of 5\n${i.productTitle ? `Product: ${i.productTitle}\n` : ""}Review: ${review ? `"${review}"` : "(no written review)"}\n\n${i.rating <= 3 ? "Thank them for the feedback, acknowledge the problem honestly and invite them to message the shop so you can help put it right. Don't promise a refund." : "Thank them warmly and briefly."}${i.attempt ? " Write a fresh version, worded differently from before." : ""} Plain text.`,
    schema: responseSchema,
    jsonSchema: { type: "object", properties: { response: { type: "string" } }, required: ["response"] },
    maxTokens: 400,
  });
  return tidy(r.response, 1500);
}

// ───────────── Reviews ─────────────

export interface CareReview {
  key: string;
  listingId: number;
  transactionId: number | null;
  rating: number;
  review: string;
  at: string;
  imageUrl: string | null;
}

interface ReviewCache {
  shopId: number;
  at: string;
  reviews: CareReview[];
}

const REVIEWS_KEY = "careReviews";
const RESPONDED_KEY = "careResponded";

export const reviewKey = (r: Pick<EtsyReview, "transaction_id" | "listing_id" | "buyer_user_id" | "create_timestamp">) =>
  r.transaction_id ? `t${r.transaction_id}` : `l${r.listing_id}-${r.buyer_user_id ?? 0}-${r.create_timestamp}`;

/** Fetch the latest reviews from Etsy and remember them. */
export async function syncReviews(db: DB, shop: Pick<ShopClient, "shop" | "reviews">): Promise<ReviewCache> {
  const before = await kvGet<ReviewCache>(db, REVIEWS_KEY);
  const res = await shop.reviews(25);
  const reviews: CareReview[] = (res.results ?? []).map((r) => ({
    key: reviewKey(r),
    listingId: r.listing_id,
    transactionId: r.transaction_id ?? null,
    rating: Math.max(0, Math.min(5, Math.round(r.rating ?? 0))),
    review: (r.review ?? "").slice(0, 3000),
    at: new Date((r.create_timestamp ?? 0) * 1000).toISOString(),
    imageUrl: r.image_url_fullxfull ?? null,
  }));
  reviews.sort((a, b) => b.at.localeCompare(a.at));
  const cache = { shopId: shop.shop.shopId, at: nowIso(), reviews };
  await kvSet(db, REVIEWS_KEY, cache);
  // A ping for new low-star reviews (not on the very first check, which loads the backlog).
  if (before?.shopId === cache.shopId) {
    const seen = new Set(before.reviews.map((r) => r.key));
    const low = reviews.filter((r) => !seen.has(r.key) && r.rating > 0 && r.rating <= 3);
    if (low.length)
      await queuePush(db, "reviews", {
        title: low.length === 1 ? `New ${low[0].rating}-star review` : `${low.length} new low reviews`,
        body: (low[0].review || "No written review, just a rating.").slice(0, 160),
        url: "/room/care",
        tag: "reviews",
      });
  }
  return cache;
}

/** The remembered reviews for this shop (none if they belong to a different shop). */
export async function cachedReviews(db: DB, shopId: number): Promise<{ at: string | null; reviews: CareReview[] }> {
  const c = await kvGet<ReviewCache>(db, REVIEWS_KEY);
  return c && c.shopId === shopId ? { at: c.at, reviews: c.reviews } : { at: null, reviews: [] };
}

export async function respondedMap(db: DB): Promise<Record<string, string>> {
  return (await kvGet<Record<string, string>>(db, RESPONDED_KEY)) ?? {};
}

export async function markResponded(db: DB, key: string, responded: boolean) {
  const m = await respondedMap(db);
  if (responded) m[key] = nowIso();
  else delete m[key];
  await kvSet(db, RESPONDED_KEY, m);
}

export const needsReply = (r: { rating: number }, responded: boolean) => r.rating > 0 && r.rating <= 3 && !responded;

const REVIEWS_EVERY_MS = 6 * 3_600_000;

/** The scheduler's review check: at most every 6 hours, once your shop is connected. */
export async function reviewsTick(db: DB, shop: Pick<ShopClient, "shop" | "reviews">, now = new Date()) {
  const c = await kvGet<ReviewCache>(db, REVIEWS_KEY);
  if (c && c.shopId === shop.shop.shopId && now.getTime() - new Date(c.at).getTime() < REVIEWS_EVERY_MS) return null;
  return syncReviews(db, shop);
}

/** Low-star reviews still waiting for your response (for the sidebar count). */
export async function unansweredReviews(db: DB): Promise<number> {
  const [cache, done] = await Promise.all([kvGet<ReviewCache>(db, REVIEWS_KEY), respondedMap(db)]);
  return (cache?.reviews ?? []).filter((r) => needsReply(r, !!done[r.key])).length;
}
