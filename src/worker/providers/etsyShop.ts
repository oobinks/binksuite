// 🛍️ Your own Etsy shop, through the official API (Open API v3), with your permission:
// you connect once (OAuth 2 with PKCE, like "Sign in with Etsy"), then BinkSuite can
// create listings as DRAFTS (with photos and download files) and read your orders.
// It never publishes: you check each draft on Etsy and press Publish yourself.
import { eq } from "drizzle-orm";
import type { DB } from "../db";
import { vault } from "../db/schema";
import type { Env } from "../env";
import { encryptSecret } from "../lib/crypto";
import { kvGet, kvSet, nowIso } from "../lib/store";
import { vaultSecret } from "../lib/vault";
import { EtsyError } from "./etsy";

const API = "https://api.etsy.com/v3/application";
const AUTHORIZE = "https://www.etsy.com/oauth/connect";
const TOKEN = "https://api.etsy.com/v3/public/oauth/token";
/** Read and write listings, read the shop and its orders. */
export const ETSY_SCOPES = ["listings_r", "listings_w", "shops_r", "transactions_r"];
const VAULT_ID = "etsy-oauth";
/** (Price Watch keeps its own "etsyShop" note, so the connection lives under its own key.) */
const SHOP_KEY = "etsyConnectedShop";

export interface EtsyShopInfo {
  shopId: number;
  shopName: string;
  userId: string;
  connectedAt: string;
}

interface Tokens {
  access: string;
  refresh: string;
  /** ms since epoch */
  expiresAt: number;
}

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export const callbackUrl = (origin: string) => `${origin}/api/etsy/callback`;
const clientId = (apiKey: string) => apiKey.split(":")[0];

/** Step 1: where to send you to approve BinkSuite on Etsy. */
export async function connectUrl(db: DB, apiKey: string, origin: string): Promise<string> {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  await kvSet(db, `etsyOauth:${state}`, { verifier, at: Date.now() });
  // Spaces as %20 (not "+"), exactly like Etsy's own examples.
  const q: [string, string][] = [
    ["response_type", "code"],
    ["redirect_uri", callbackUrl(origin)],
    ["scope", ETSY_SCOPES.join(" ")],
    ["client_id", clientId(apiKey)],
    ["state", state],
    ["code_challenge", challenge],
    ["code_challenge_method", "S256"],
  ];
  return `${AUTHORIZE}?${q.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")}`;
}

async function saveTokens(db: DB, env: Env, t: Tokens) {
  const { ciphertext, iv } = await encryptSecret(JSON.stringify(t), env.VAULT_MASTER_KEY!);
  const row = { provider: VAULT_ID, ciphertext, iv, last4: t.access.slice(-4), updatedAt: nowIso() };
  await db.insert(vault).values(row).onConflictDoUpdate({ target: vault.provider, set: row });
}

async function tokenRequest(params: Record<string, string>, fetcher: typeof fetch): Promise<Tokens> {
  const res = await fetcher(TOKEN, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params).toString() });
  if (!res.ok) throw new EtsyError(`Etsy didn't accept the sign-in (${res.status}). Try connecting again.`, res.status);
  const j = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
  return { access: j.access_token, refresh: j.refresh_token, expiresAt: Date.now() + (j.expires_in - 60) * 1000 };
}

/** Step 2: Etsy sends you back with a code; swap it for tokens and find your shop. */
export async function finishConnect(db: DB, env: Env, apiKey: string, origin: string, code: string, state: string, fetcher: typeof fetch = fetch): Promise<EtsyShopInfo> {
  const saved = await kvGet<{ verifier: string; at: number }>(db, `etsyOauth:${state}`);
  if (!saved || Date.now() - saved.at > 15 * 60_000) throw new EtsyError("That Etsy sign-in link has expired. Tap Connect again.", 400);
  await kvSet(db, `etsyOauth:${state}`, null);
  const tokens = await tokenRequest(
    { grant_type: "authorization_code", client_id: clientId(apiKey), redirect_uri: callbackUrl(origin), code, code_verifier: saved.verifier },
    fetcher,
  );
  await saveTokens(db, env, tokens);
  // The access token starts with your Etsy user id.
  const userId = tokens.access.split(".")[0];
  const res = await fetcher(`${API}/users/${userId}/shops`, { headers: { "x-api-key": apiKey, authorization: `Bearer ${tokens.access}` } });
  if (!res.ok) throw new EtsyError(`Connected, but couldn't find your shop (${res.status}).`, res.status);
  const shop = (await res.json()) as { shop_id: number; shop_name: string } | { results?: { shop_id: number; shop_name: string }[] };
  const s = "shop_id" in shop ? shop : shop.results?.[0];
  if (!s) throw new EtsyError("Connected, but this Etsy account has no shop.", 404);
  const info: EtsyShopInfo = { shopId: s.shop_id, shopName: s.shop_name, userId, connectedAt: nowIso() };
  await kvSet(db, SHOP_KEY, info);
  return info;
}

export async function disconnect(db: DB) {
  await db.delete(vault).where(eq(vault.provider, VAULT_ID));
  await kvSet(db, SHOP_KEY, null);
}

/** Your connected shop (only a real, completed connection counts). */
export async function shopInfo(db: DB): Promise<EtsyShopInfo | null> {
  const s = await kvGet<EtsyShopInfo>(db, SHOP_KEY);
  return s && s.shopId && s.shopName && s.userId && s.connectedAt ? s : null;
}

export interface DraftListing {
  title: string;
  description: string;
  pricePence: number;
  tags: string[];
  taxonomyId: number;
}

/** A client for your connected shop, or null if it isn't connected. Refreshes the sign-in when needed. */
export async function shopClient(db: DB, env: Env, apiKey: string, fetcher: typeof fetch = fetch) {
  const shop = await shopInfo(db);
  const raw = await vaultSecret(db, env, VAULT_ID);
  if (!shop || !raw) return null;
  let tokens = JSON.parse(raw) as Tokens;
  const auth = async () => {
    if (Date.now() >= tokens.expiresAt) {
      tokens = await tokenRequest({ grant_type: "refresh_token", client_id: clientId(apiKey), refresh_token: tokens.refresh }, fetcher);
      await saveTokens(db, env, tokens);
    }
    return { "x-api-key": apiKey, authorization: `Bearer ${tokens.access}` };
  };
  const call = async <T>(method: string, path: string, body?: BodyInit, kind?: "form" | "json"): Promise<T> => {
    const headers: Record<string, string> = { ...(await auth()), accept: "application/json" };
    if (kind === "form") headers["content-type"] = "application/x-www-form-urlencoded";
    if (kind === "json") headers["content-type"] = "application/json";
    const res = await fetcher(`${API}${path}`, { method, headers, body });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      const why = /"error"\s*:\s*"([^"]{1,200})"/.exec(detail)?.[1];
      throw new EtsyError(
        res.status === 401 || res.status === 403 ? "Etsy needs you to reconnect your shop (Settings → Etsy)." : `Etsy said no (${res.status})${why ? `: ${why}` : ""}.`,
        res.status,
      );
    }
    return (await res.json()) as T;
  };
  return {
    shop,
    /** A new listing in your shop as a draft (not visible to buyers). */
    async createDraft(l: DraftListing, now = new Date()): Promise<{ listingId: number }> {
      // "When was it made": a recent-years bucket, not "made_to_order" (which tells buyers the files
      // only arrive after you complete the order, instead of an instant download). Etsy moves the
      // bucket's end year each year, so try this year's first and step back if it's refused.
      const year = now.getUTCFullYear();
      const buckets = [`2020_${year}`, `2020_${year - 1}`, `2020_${year + 1}`];
      let lastError: unknown;
      for (const whenMade of buckets) {
        try {
          return await this.createDraftAs(l, whenMade);
        } catch (e) {
          lastError = e;
          // A refused year bucket is a 400; anything else (sign-in, rate limit) stops here.
          if (!(e instanceof EtsyError) || e.status !== 400) throw e;
        }
      }
      throw lastError;
    },
    async createDraftAs(l: DraftListing, whenMade: string): Promise<{ listingId: number }> {
      // Form-encoded, like Etsy's own examples; list fields (tags) are comma-separated.
      const form = new URLSearchParams({
        quantity: "999",
        title: l.title,
        description: l.description,
        price: (Math.round(l.pricePence) / 100).toFixed(2),
        who_made: "i_did",
        when_made: whenMade,
        taxonomy_id: String(l.taxonomyId),
        type: "download",
        is_supply: "false",
        tags: l.tags.map((t) => t.replace(/,/g, " ")).join(","),
        // Renewing is your call: BinkSuite asks you a week before each listing expires.
        should_auto_renew: "false",
      });
      const r = await call<{ listing_id: number }>("POST", `/shops/${shop.shopId}/listings`, form, "form");
      return { listingId: r.listing_id };
    },
    async uploadImage(listingId: number, image: Blob, rank: number) {
      const form = new FormData();
      form.append("image", image, `photo-${rank}.jpg`);
      form.append("rank", String(rank));
      await call("POST", `/shops/${shop.shopId}/listings/${listingId}/images`, form);
    },
    async uploadFile(listingId: number, file: Blob, name: string, rank: number) {
      const form = new FormData();
      form.append("file", file, name);
      form.append("name", name);
      form.append("rank", String(rank));
      await call("POST", `/shops/${shop.shopId}/listings/${listingId}/files`, form);
    },
    /** A listing's state, when it expires, and how it's doing. */
    async listing(listingId: number) {
      return call<{ listing_id: number; state: string; ending_timestamp?: number; views?: number; num_favorers?: number; url?: string }>("GET", `/listings/${listingId}`);
    },
    /** A listing's words, price, state and photos, as they are on Etsy now. */
    async listingFull(listingId: number) {
      return call<EtsyListingFull>("GET", `/listings/${listingId}?includes=Images`);
    },
    /** Change a listing's words on Etsy (live listings change straight away). */
    async updateListing(listingId: number, f: { title?: string; description?: string; tags?: string[] }) {
      const form = new URLSearchParams();
      if (f.title !== undefined) form.set("title", f.title);
      if (f.description !== undefined) form.set("description", f.description);
      if (f.tags !== undefined) form.set("tags", f.tags.map((t) => t.replace(/,/g, " ")).join(","));
      await call("PATCH", `/shops/${shop.shopId}/listings/${listingId}`, form, "form");
    },
    /** Change the price: Etsy keeps it on the listing's inventory, so read it, change every offering, write it back. */
    async setPrice(listingId: number, pricePence: number) {
      const inv = await call<EtsyInventory>("GET", `/listings/${listingId}/inventory`);
      const body = {
        products: inv.products.map((p) => ({
          sku: p.sku ?? "",
          // Only the fields Etsy accepts back (a digital listing usually has none).
          property_values: (p.property_values ?? []).map((v) => ({ property_id: v.property_id, value_ids: v.value_ids, scale_id: v.scale_id ?? null, property_name: v.property_name, values: v.values })),
          offerings: p.offerings.map((o) => ({ price: Math.round(pricePence) / 100, quantity: o.quantity, is_enabled: o.is_enabled })),
        })),
        price_on_property: inv.price_on_property ?? [],
        quantity_on_property: inv.quantity_on_property ?? [],
        sku_on_property: inv.sku_on_property ?? [],
      };
      await call("PUT", `/listings/${listingId}/inventory`, JSON.stringify(body), "json");
    },
    async receipts(minCreatedSec: number, limit = 50) {
      return call<{ count: number; results: EtsyReceipt[] }>("GET", `/shops/${shop.shopId}/receipts?was_paid=true&min_created=${minCreatedSec}&limit=${limit}&sort_on=created&sort_order=asc`);
    },
    /** Your shop's most recent reviews (read only: responses are posted on Etsy by you). */
    async reviews(limit = 25) {
      return call<{ count: number; results: EtsyReview[] }>("GET", `/shops/${shop.shopId}/reviews?limit=${limit}`);
    },
  };
}

export interface EtsyListingFull {
  listing_id: number;
  title: string;
  description: string;
  tags: string[];
  state: string;
  url?: string;
  views?: number;
  num_favorers?: number;
  ending_timestamp?: number;
  price?: { amount: number; divisor: number; currency_code: string };
  images?: { url_570xN?: string; url_fullxfull?: string; rank?: number }[];
}

interface EtsyInventory {
  products: {
    sku?: string;
    property_values?: { property_id: number; value_ids: number[]; scale_id?: number | null; property_name: string; values: string[] }[];
    offerings: { price: unknown; quantity: number; is_enabled: boolean }[];
  }[];
  price_on_property?: number[];
  quantity_on_property?: number[];
  sku_on_property?: number[];
}

export type ShopClient = NonNullable<Awaited<ReturnType<typeof shopClient>>>;

export interface EtsyReceipt {
  receipt_id: number;
  created_timestamp: number;
  is_paid: boolean;
  message_from_buyer?: string | null;
  grandtotal?: { amount: number; divisor: number; currency_code: string };
  transactions: { transaction_id: number; listing_id: number; title: string; quantity: number; price: { amount: number; divisor: number; currency_code: string } }[];
}

export interface EtsyReview {
  shop_id: number;
  listing_id: number;
  transaction_id?: number | null;
  buyer_user_id?: number | null;
  rating: number;
  review?: string | null;
  language?: string | null;
  image_url_fullxfull?: string | null;
  create_timestamp: number;
  created_timestamp?: number;
  update_timestamp?: number;
}

// ───────────── Etsy categories ─────────────

interface TaxNode {
  id: number;
  name: string;
  children?: TaxNode[];
}

/** Where each kind of product goes in Etsy's category tree (first match wins). */
export const TAXONOMY_PATHS: Record<string, string[][]> = {
  excel: [["Paper & Party Supplies", "Paper", "Calendars & Planners"], ["Calendars & Planners"], ["Templates"]],
  pdf: [["Paper & Party Supplies", "Paper", "Calendars & Planners"], ["Calendars & Planners"], ["Planners"]],
  art: [["Art & Collectibles", "Prints", "Digital Prints"], ["Digital Prints"], ["Prints"]],
};

export function findTaxonomy(tree: TaxNode[], paths: string[][]): { id: number; path: string } | null {
  const all: { node: TaxNode; path: string[] }[] = [];
  const walk = (nodes: TaxNode[], path: string[]) => {
    for (const n of nodes) {
      const p = [...path, n.name];
      all.push({ node: n, path: p });
      if (n.children?.length) walk(n.children, p);
    }
  };
  walk(tree, []);
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  for (const want of paths) {
    const w = want.map(norm);
    const hit = all.find(({ path }) => {
      const p = path.map(norm);
      return w.length <= p.length && w.every((x, i) => p[p.length - w.length + i] === x);
    });
    if (hit) return { id: hit.node.id, path: hit.path.join(" › ") };
  }
  return null;
}

/** The category id for a product kind, looked up once and remembered. */
export async function taxonomyFor(db: DB, apiKey: string, format: string, fetcher: typeof fetch = fetch): Promise<{ id: number; path: string }> {
  const cached = await kvGet<{ id: number; path: string }>(db, `etsyTaxonomy:${format}`);
  if (cached) return cached;
  const res = await fetcher(`${API}/seller-taxonomy/nodes`, { headers: { "x-api-key": apiKey, accept: "application/json" } });
  if (!res.ok) throw new EtsyError(`Couldn't read Etsy's categories (${res.status}).`, res.status);
  const tree = ((await res.json()) as { results: TaxNode[] }).results;
  const found = findTaxonomy(tree, TAXONOMY_PATHS[format] ?? TAXONOMY_PATHS.pdf);
  if (!found) throw new EtsyError("Couldn't find a matching Etsy category for this product.", 404);
  await kvSet(db, `etsyTaxonomy:${format}`, found);
  return found;
}

export const editUrl = (listingId: number) => `https://www.etsy.com/your/shops/me/listing-editor/edit/${listingId}`;
