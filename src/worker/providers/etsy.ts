// Etsy Open API v3, read-only public data (no shop login needed): active listing
// search and a shop's active listings. Uses your app's keystring + shared secret,
// stored encrypted in the Key Vault as "keystring:sharedsecret".
// Official API only, never scraping. Etsy allows ~5–10 requests/second, 5–10k/day.

const BASE = "https://openapi.etsy.com/v3/application";

export interface EtsyListing {
  id: number;
  title: string;
  /** Converted to GBP pence (non-GBP/USD/EUR listings are skipped). */
  pricePence: number;
  favourites: number;
  views: number | null;
  createdAt: string;
  url: string;
  tags: string[];
  shopId: number;
}

export interface EtsySearch {
  /** Total matching active listings on Etsy: the size of the competition. */
  total: number;
  listings: EtsyListing[];
}

interface RawListing {
  listing_id: number;
  title: string;
  price?: { amount: number; divisor: number; currency_code: string };
  num_favorers?: number;
  views?: number;
  created_timestamp?: number;
  original_creation_timestamp?: number;
  url?: string;
  tags?: string[];
  shop_id: number;
  /** "physical" | "download" | "both" */
  listing_type?: string;
}

const DIGITAL_WORDS = /printable|digital|download|template|svg|png|pdf/i;

/** We compete with digital downloads, so search for those rather than posters and framed prints. */
export function digitalQuery(keywords: string): string {
  return DIGITAL_WORDS.test(keywords) ? keywords : `${keywords} printable`;
}

export class EtsyError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export function toGbpPence(price: RawListing["price"], usdToGbp: number): number | null {
  if (!price || !price.divisor) return null;
  const major = price.amount / price.divisor;
  const rate = price.currency_code === "GBP" ? 1 : price.currency_code === "USD" ? usdToGbp : price.currency_code === "EUR" ? 0.86 : null;
  return rate === null ? null : Math.round(major * rate * 100);
}

function tidy(raw: RawListing, usdToGbp: number): EtsyListing | null {
  const pricePence = toGbpPence(raw.price, usdToGbp);
  if (pricePence === null) return null;
  const ts = raw.original_creation_timestamp ?? raw.created_timestamp ?? 0;
  return {
    id: raw.listing_id,
    title: raw.title,
    pricePence,
    favourites: raw.num_favorers ?? 0,
    views: raw.views ?? null,
    createdAt: new Date(ts * 1000).toISOString(),
    url: raw.url ?? `https://www.etsy.com/listing/${raw.listing_id}`,
    tags: raw.tags ?? [],
    shopId: raw.shop_id,
  };
}

export function etsyClient(apiKey: string, usdToGbp: number, fetcher: typeof fetch = fetch) {
  const get = async <T>(path: string, params: Record<string, string | number>): Promise<T> => {
    const url = new URL(BASE + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    const res = await fetcher(url.toString(), { headers: { "x-api-key": apiKey, accept: "application/json" } });
    if (!res.ok) {
      const msg =
        res.status === 401 || res.status === 403
          ? "Etsy didn't accept your API key. Check it's entered as keystring:sharedsecret in Settings."
          : res.status === 429
            ? "Etsy says we're asking too often. The radar will slow down and try again later."
            : `Etsy replied with an error (${res.status}).`;
      throw new EtsyError(msg, res.status);
    }
    return (await res.json()) as T;
  };
  return {
    /** Newest active digital listings for a keyword (newest first gives the "what's moving now" view). Physical items are left out. */
    async search(keywords: string, sortOn: "created" | "score" = "created", limit = 100): Promise<EtsySearch> {
      const r = await get<{ count: number; results: RawListing[] }>("/listings/active", { keywords: digitalQuery(keywords), limit, sort_on: sortOn, sort_order: "desc" });
      const digital = r.results.filter((x) => x.listing_type !== "physical");
      return { total: r.count, listings: digital.map((x) => tidy(x, usdToGbp)).filter((x): x is EtsyListing => !!x) };
    },
    async findShop(name: string): Promise<{ shopId: number; name: string } | null> {
      const r = await get<{ results: { shop_id: number; shop_name: string }[] }>("/shops", { shop_name: name, limit: 5 });
      const s = r.results.find((x) => x.shop_name.toLowerCase() === name.toLowerCase()) ?? r.results[0];
      return s ? { shopId: s.shop_id, name: s.shop_name } : null;
    },
    async shopListings(shopId: number, limit = 100): Promise<EtsyListing[]> {
      const r = await get<{ results: RawListing[] }>(`/shops/${shopId}/listings/active`, { limit });
      return r.results.map((x) => tidy(x, usdToGbp)).filter((x): x is EtsyListing => !!x);
    },
  };
}

export type EtsyClient = ReturnType<typeof etsyClient>;
