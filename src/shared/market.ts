// Market maths for Trend Radar and Price Watch. Pure functions, unit-tested.

export interface MarketListing {
  pricePence: number;
  favourites: number;
  createdAt: string;
}

export interface MarketRead {
  /** Total active competing listings on Etsy. */
  totalListings: number;
  medianPricePence: number;
  /** 25th percentile: the cheap end of what's selling. */
  lowPricePence: number;
  /** Avg favourites per day on items listed in the last 60 days. */
  favsPerDay: number;
  /** How many of the sampled listings appeared in the last 30 days. */
  newListings30d: number;
  /** 0–100: rising demand (favourites on new items) against crowding. */
  score: number;
}

const DAY = 86_400_000;

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[i];
}

export function readMarket(listings: MarketListing[], totalListings: number, now = new Date()): MarketRead | null {
  if (!listings.length) return null;
  const prices = listings.map((l) => l.pricePence).filter((p) => p > 0).sort((a, b) => a - b);
  const recent = listings.filter((l) => now.getTime() - new Date(l.createdAt).getTime() < 60 * DAY);
  const favsPerDay = recent.length
    ? recent.reduce((a, l) => a + l.favourites / Math.max(1, (now.getTime() - new Date(l.createdAt).getTime()) / DAY), 0) / recent.length
    : 0;
  const newListings30d = listings.filter((l) => now.getTime() - new Date(l.createdAt).getTime() < 30 * DAY).length;
  return {
    totalListings,
    medianPricePence: percentile(prices, 0.5),
    lowPricePence: percentile(prices, 0.25),
    favsPerDay: Math.round(favsPerDay * 100) / 100,
    newListings30d,
    score: trendScore(favsPerDay, totalListings),
  };
}

/**
 * Demand momentum vs competition, squashed to 0–100.
 * ~1 favourite/day on new listings with ~5k competitors scores about 50.
 */
export function trendScore(favsPerDay: number, totalListings: number): number {
  const demand = Math.log1p(favsPerDay * 10);
  const crowding = Math.log10(Math.max(10, totalListings));
  const raw = (demand / crowding) * 70;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

/** Undercut price: a set % below the market median, never below your profit floor. */
export function undercutPrice(medianPence: number, undercutPercent: number, floorPence: number): number {
  const target = Math.round(medianPence * (1 - undercutPercent / 100));
  const pounds = Math.floor(target / 100);
  // Charm pricing just under the target: .99 or .49 below it.
  const charm = [pounds * 100 - 1, pounds * 100 + 49].filter((p) => p <= target && p > 0).pop() ?? target;
  return Math.max(floorPence, charm);
}

/** Price Watch: is our price meaningfully above the market? */
export function priceAlert(ourPence: number, medianPence: number, tolerancePercent: number): { tooHigh: boolean; percentAbove: number } {
  const percentAbove = Math.round(((ourPence - medianPence) / medianPence) * 100);
  return { tooHigh: percentAbove > tolerancePercent, percentAbove };
}
