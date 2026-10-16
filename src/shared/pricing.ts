// Comparing your price with similar listings you've spotted on Etsy.

export interface CompetitorPrice {
  pricePence: number;
  /** Optional: shop name, what was included, a link… */
  note?: string;
}

export interface PriceStats {
  count: number;
  averagePence: number;
  medianPence: number;
  minPence: number;
  maxPence: number;
}

export function priceStats(prices: number[]): PriceStats | null {
  const p = prices.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (!p.length) return null;
  const mid = Math.floor(p.length / 2);
  return {
    count: p.length,
    averagePence: Math.round(p.reduce((a, b) => a + b, 0) / p.length),
    medianPence: p.length % 2 ? p[mid] : Math.round((p[mid - 1] + p[mid]) / 2),
    minPence: p[0],
    maxPence: p[p.length - 1],
  };
}

/** How your price compares with the average, e.g. -12 means 12% cheaper. */
export function percentVsAverage(yourPence: number, stats: PriceStats): number {
  return Math.round(((yourPence - stats.averagePence) / stats.averagePence) * 100);
}

/** Round up to a shop-friendly price ending in .49 or .99. */
export function friendlyPrice(pence: number): number {
  const pounds = Math.floor(pence / 100);
  const p49 = pounds * 100 + 49;
  const p99 = pounds * 100 + 99;
  return pence <= p49 ? p49 : pence <= p99 ? p99 : p49 + 100;
}

/** Etsy UK search for similar items (you look; the app never scrapes). */
export function etsySearchUrl(query: string): string {
  return `https://www.etsy.com/uk/search?q=${encodeURIComponent(query.trim())}&ship_to=GB`;
}
