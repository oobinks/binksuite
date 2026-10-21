// 🚀 Send a finished product to your Etsy shop as a DRAFT: listing words and price,
// the listing photos in order, and the files buyers download. You then open the draft
// on Etsy, check it and press Publish yourself.
import { eq } from "drizzle-orm";
import type { DB } from "../db";
import { products } from "../db/schema";
import type { Env } from "../env";
import { formatOf } from "../../shared/format";
import { nowIso } from "../lib/store";
import { editUrl, etsyFileName, shopClient, taxonomyFor } from "../providers/etsyShop";
import { EtsyError } from "../providers/etsy";
import type { ProductRow } from "./agents/types";

/** Etsy's limits: 10 photos is plenty (it allows more), 5 digital files, 20 MB each. */
const MAX_PHOTOS = 10;
const MAX_FILES = 5;
const MAX_FILE_BYTES = 20 * 1024 * 1024;

export interface Deliverable {
  key: string;
  name: string;
}

export interface EtsyDraftInfo {
  listingId: number;
  editUrl: string;
  at: string;
  photos: number;
  files: string[];
  category: string;
}

interface Data {
  listing?: { title: string; tags: string[]; description: string };
  keptImages?: string[];
  deliverables?: Deliverable[];
  zipKey?: string;
  zip?: string;
  etsy?: EtsyDraftInfo;
}

async function loadPhoto(files: R2Bucket, key: string): Promise<Blob | null> {
  const obj = await files.get(key);
  if (!obj) return null;
  // Generated art is stored as base64 text.
  if (key.endsWith(".b64")) {
    const text = (await obj.text()).trim();
    const bin = atob(text);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: "image/jpeg" });
  }
  return new Blob([await obj.arrayBuffer()], { type: obj.httpMetadata?.contentType ?? "image/jpeg" });
}

export async function sendDraft(db: DB, env: Env, apiKey: string, product: ProductRow, opts: { again?: boolean; fetcher?: typeof fetch } = {}): Promise<EtsyDraftInfo> {
  const fetcher = opts.fetcher ?? fetch;
  const d = product.data as Data;
  if (d.etsy && !opts.again) return d.etsy;
  if (!d.listing) throw new EtsyError("The listing words aren't written yet.", 400);
  if (!product.pricePence) throw new EtsyError("Set a price first.", 400);
  const files = d.deliverables?.length ? d.deliverables : d.zipKey ? [{ key: d.zipKey, name: d.zip ?? d.zipKey.split("/").pop()! }] : [];
  if (!files.length) throw new EtsyError("Build the product's files first.", 400);
  const shop = await shopClient(db, env, apiKey, fetcher);
  if (!shop) throw new EtsyError("Connect your Etsy shop first (Settings → Etsy).", 400);

  const category = await taxonomyFor(db, apiKey, formatOf(product), fetcher);
  const { listingId } = await shop.createDraft({
    title: d.listing.title,
    description: d.listing.description,
    pricePence: product.pricePence,
    tags: d.listing.tags.slice(0, 13),
    taxonomyId: category.id,
  });

  let photos = 0;
  for (const key of (d.keptImages ?? []).slice(0, MAX_PHOTOS)) {
    const img = await loadPhoto(env.FILES, key);
    if (!img) continue;
    await shop.uploadImage(listingId, img, ++photos);
  }

  const sent: string[] = [];
  const taken = new Set<string>();
  for (const f of files.slice(0, MAX_FILES)) {
    const obj = await env.FILES.get(f.key);
    if (!obj) continue;
    if (obj.size > MAX_FILE_BYTES) throw new EtsyError(`“${f.name}” is over Etsy's 20 MB limit for a download file.`, 413);
    const name = etsyFileName(f.name, taken);
    await shop.uploadFile(listingId, new Blob([await obj.arrayBuffer()]), name, sent.length + 1);
    sent.push(name);
  }

  const info: EtsyDraftInfo = { listingId, editUrl: editUrl(listingId), at: nowIso(), photos, files: sent, category: category.path };
  await db
    .update(products)
    .set({ data: { ...product.data, etsy: info }, updatedAt: nowIso() })
    .where(eq(products.id, product.id));
  return info;
}
