// Etsy UK fee calculator. Shared by the browser (live as you type) and the Worker.
// All money is handled in pence (integers) to avoid float drift; rates are plain numbers.

export interface FeeSettings {
  /** Etsy listing fee in USD (charged per listing / per sale renewal). */
  listingFeeUsd: number;
  /** GBP per 1 USD, editable. */
  usdToGbp: number;
  /** 0.065 = 6.5% */
  transactionRate: number;
  processingRate: number;
  processingFixedPence: number;
  regulatoryRate: number;
  /** VAT charged on Etsy fees because the shop isn't VAT registered. */
  vatRate: number;
  /** Payment processing is usually VAT-exempt; flip if your statement says otherwise. */
  vatOnProcessing: boolean;
  offsiteAdsRate: number;
  offsiteAdsCapUsd: number;
  currencyConversionRate: number;
}

export const DEFAULT_FEES: FeeSettings = {
  listingFeeUsd: 0.2,
  usdToGbp: 0.79,
  transactionRate: 0.065,
  processingRate: 0.04,
  processingFixedPence: 20,
  regulatoryRate: 0.0048,
  vatRate: 0.2,
  vatOnProcessing: false,
  offsiteAdsRate: 0.15,
  offsiteAdsCapUsd: 100,
  currencyConversionRate: 0.025,
};

export interface SaleInput {
  /** What the buyer paid for the item(s), in pence, GBP equivalent. */
  pricePence: number;
  quantity?: number;
  /** Shipping charged — always 0 for digital downloads, kept for completeness. */
  shippingPence?: number;
  offsiteAds?: boolean;
  /** Sale made in a currency other than GBP. */
  nonGbp?: boolean;
  /** Your own cost for this sale (AI/image API spend etc.), pence. */
  costPence?: number;
}

export interface FeeLine {
  key: string;
  label: string;
  pence: number;
  vatable: boolean;
}

export interface FeeBreakdown {
  grossPence: number;
  lines: FeeLine[];
  feesBeforeVatPence: number;
  vatPence: number;
  totalFeesPence: number;
  costPence: number;
  netPence: number;
  /** net / gross, 0..1 */
  margin: number;
}

const round = (n: number) => Math.round(n);

export function calculateFees(input: SaleInput, s: FeeSettings = DEFAULT_FEES): FeeBreakdown {
  const qty = Math.max(1, Math.floor(input.quantity ?? 1));
  const gross = Math.max(0, round(input.pricePence * qty + (input.shippingPence ?? 0)));
  const lines: FeeLine[] = [];

  // One listing fee per item sold (Etsy renews the listing on each sale).
  lines.push({
    key: "listing",
    label: `Listing fee ($${s.listingFeeUsd.toFixed(2)} × ${qty})`,
    pence: round(s.listingFeeUsd * s.usdToGbp * 100 * qty),
    vatable: true,
  });
  lines.push({
    key: "transaction",
    label: `Transaction fee (${pct(s.transactionRate)})`,
    pence: round(gross * s.transactionRate),
    vatable: true,
  });
  lines.push({
    key: "processing",
    label: `Payment processing (${pct(s.processingRate)} + £${(s.processingFixedPence / 100).toFixed(2)})`,
    pence: gross > 0 ? round(gross * s.processingRate + s.processingFixedPence) : 0,
    vatable: s.vatOnProcessing,
  });
  lines.push({
    key: "regulatory",
    label: `Regulatory operating fee (${pct(s.regulatoryRate)})`,
    pence: round(gross * s.regulatoryRate),
    vatable: true,
  });
  if (input.offsiteAds) {
    const capPence = s.offsiteAdsCapUsd * s.usdToGbp * 100;
    lines.push({
      key: "offsiteAds",
      label: `Offsite Ads (${pct(s.offsiteAdsRate)}, capped $${s.offsiteAdsCapUsd})`,
      pence: round(Math.min(gross * s.offsiteAdsRate, capPence)),
      vatable: true,
    });
  }
  if (input.nonGbp) {
    lines.push({
      key: "currency",
      label: `Currency conversion (${pct(s.currencyConversionRate)})`,
      pence: round(gross * s.currencyConversionRate),
      vatable: false,
    });
  }

  const feesBeforeVat = lines.reduce((a, l) => a + l.pence, 0);
  const vatBase = lines.filter((l) => l.vatable).reduce((a, l) => a + l.pence, 0);
  const vat = round(vatBase * s.vatRate);
  const total = feesBeforeVat + vat;
  const cost = Math.max(0, round(input.costPence ?? 0));
  const net = gross - total - cost;
  return {
    grossPence: gross,
    lines,
    feesBeforeVatPence: feesBeforeVat,
    vatPence: vat,
    totalFeesPence: total,
    costPence: cost,
    netPence: net,
    margin: gross > 0 ? net / gross : 0,
  };
}

/** Lowest price (in whole pence) that still clears `minProfitPence` after fees and cost. */
export function minimumPriceFor(minProfitPence: number, costPence: number, s: FeeSettings = DEFAULT_FEES): number {
  let lo = 0;
  let hi = 100_000_00;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (calculateFees({ pricePence: mid, costPence }, s).netPence >= minProfitPence) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

function pct(r: number) {
  return `${+(r * 100).toFixed(2)}%`;
}

export function formatGBP(pence: number): string {
  const sign = pence < 0 ? "-" : "";
  return `${sign}£${(Math.abs(pence) / 100).toFixed(2)}`;
}
