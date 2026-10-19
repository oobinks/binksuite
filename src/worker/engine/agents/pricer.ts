// 🏷️ The Pricer's maths, shared by the demo and real versions of the price step.
import { calculateFees, minimumPriceFor } from "../../../shared/fees";
import { intBetween } from "../../../shared/rng";
import { friendlyPrice, priceStats, type CompetitorPrice, type SimilarListing } from "../../../shared/pricing";
import { undercutPrice } from "../../../shared/market";
import { separatePrice, savingPercent, type BundleSpec } from "../../../shared/bundle";
import type { Settings } from "../../../shared/settings";
import type { MarketReport } from "./marketResearch";
import type { ProductRow, StepResult } from "./types";

/** Similar listings needed before their prices set yours. */
const ENOUGH_SIMILAR = 3;

export function priceProduct(product: ProductRow, settings: Settings, rng: () => number): StepResult {
  const floor = minimumPriceFor(settings.minProfitPence, 10, settings.fees);
  const bundle = (product.data as { bundle?: BundleSpec }).bundle;
  if (bundle) {
    // 🎁 A real saving on what the products sell for separately (never an invented "was" price).
    const separate = separatePrice(bundle.items);
    const target = friendlyPrice(Math.round(separate * (1 - bundle.savePercent / 100)));
    const pricePence = Math.max(floor, Math.min(target, separate - 1));
    const fees = calculateFees({ pricePence, costPence: 10 }, settings.fees);
    return {
      output: {
        pricePence,
        floorPence: floor,
        netPence: fees.netPence,
        feesPence: fees.totalFeesPence,
        minProfitPence: settings.minProfitPence,
        separatePence: separate,
        savePercent: savingPercent(separate, pricePence),
        items: bundle.items.map((i) => ({ title: i.title, pricePence: i.pricePence })),
      },
      pricePence,
      log: `Bundle priced at £${(pricePence / 100).toFixed(2)}: ${savingPercent(separate, pricePence)}% less than £${(separate / 100).toFixed(2)} separately`,
    };
  }
  const d = product.data as {
    report?: MarketReport;
    competitors?: CompetitorPrice[];
    similar?: SimilarListing[];
    similarQuery?: string;
    market?: { medianPricePence: number; totalListings: number };
  };
  // Undercut the market: your own competitor checks first, then similar products on
  // Etsy right now, then the niche's live data, then Scout's estimate. Never below the
  // price that clears your minimum profit.
  const yours = priceStats((d.competitors ?? []).map((c) => c.pricePence));
  const similar = d.similar && d.similar.length >= ENOUGH_SIMILAR ? priceStats(d.similar.map((s) => s.pricePence)) : null;
  const range = d.report?.priceRangePence;
  const median = yours?.medianPence ?? similar?.medianPence ?? (d.market?.medianPricePence || (range ? range[1] : 0));
  const finalPrice = median ? undercutPrice(median, settings.radar.undercutPercent, floor) : friendlyPrice(Math.max(floor, intBetween(rng, 3, 7) * 100 - 2));
  const fees = calculateFees({ pricePence: finalPrice, costPence: 10 }, settings.fees);
  const source = yours ? "your checks" : similar ? `${d.similar!.length} similar products on Etsy` : d.market?.medianPricePence ? "live Etsy data" : range ? "Scout's estimate" : null;
  return {
    output: {
      pricePence: finalPrice,
      floorPence: floor,
      netPence: fees.netPence,
      feesPence: fees.totalFeesPence,
      minProfitPence: settings.minProfitPence,
      marketRangePence: range ?? null,
      marketMedianPence: median || null,
      undercutPercent: settings.radar.undercutPercent,
      marketSource: source,
      similar: d.similar ?? [],
      searchQuery: (d.similarQuery ?? d.report?.keywords?.[0] ?? product.niche).slice(0, 80),
    },
    pricePence: finalPrice,
    log: `Priced at £${(finalPrice / 100).toFixed(2)} (net £${(fees.netPence / 100).toFixed(2)})${source ? `, from ${source}` : ""}`,
  };
}
