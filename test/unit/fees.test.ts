import { describe, expect, it } from "vitest";
import { calculateFees, DEFAULT_FEES, minimumPriceFor, formatGBP } from "../../src/shared/fees";

describe("fee calculator", () => {
  it("matches the hand-worked £25 example (≈ £3.11 before VAT)", () => {
    // listing $0.20 × 0.79 = 15.8p → 16p
    // transaction 6.5% of 2500 = 162.5p → 163p
    // processing 4% + 20p = 120p
    // regulatory 0.48% = 12p
    const r = calculateFees({ pricePence: 2500 });
    const line = (k: string) => r.lines.find((l) => l.key === k)!.pence;
    expect(line("listing")).toBe(16);
    expect(line("transaction")).toBe(163);
    expect(line("processing")).toBe(120);
    expect(line("regulatory")).toBe(12);
    expect(r.feesBeforeVatPence).toBe(311);
  });

  it("adds 20% VAT on Etsy fees but not on payment processing by default", () => {
    const r = calculateFees({ pricePence: 2500 });
    // VAT base = 16 + 163 + 12 = 191 → 38.2 → 38
    expect(r.vatPence).toBe(38);
    expect(r.totalFeesPence).toBe(349);
    expect(r.netPence).toBe(2500 - 349);
  });

  it("can charge VAT on processing too when toggled", () => {
    const r = calculateFees({ pricePence: 2500 }, { ...DEFAULT_FEES, vatOnProcessing: true });
    expect(r.vatPence).toBe(Math.round((16 + 163 + 120 + 12) * 0.2));
  });

  it("caps Offsite Ads at $100", () => {
    const small = calculateFees({ pricePence: 1000, offsiteAds: true });
    expect(small.lines.find((l) => l.key === "offsiteAds")!.pence).toBe(150);
    const huge = calculateFees({ pricePence: 1_000_000, offsiteAds: true });
    expect(huge.lines.find((l) => l.key === "offsiteAds")!.pence).toBe(Math.round(100 * 0.79 * 100));
  });

  it("adds 2.5% currency conversion on non-GBP sales, without VAT", () => {
    const gbp = calculateFees({ pricePence: 1000 });
    const usd = calculateFees({ pricePence: 1000, nonGbp: true });
    expect(usd.lines.find((l) => l.key === "currency")!.pence).toBe(25);
    expect(usd.vatPence).toBe(gbp.vatPence);
  });

  it("subtracts your own costs and handles quantity", () => {
    const r = calculateFees({ pricePence: 500, quantity: 2, costPence: 30 });
    expect(r.grossPence).toBe(1000);
    expect(r.lines.find((l) => l.key === "listing")!.pence).toBe(32);
    expect(r.netPence).toBe(1000 - r.totalFeesPence - 30);
  });

  it("charges nothing on a £0 sale except the listing fee", () => {
    const r = calculateFees({ pricePence: 0 });
    expect(r.lines.find((l) => l.key === "processing")!.pence).toBe(0);
  });

  it("finds the minimum price that clears a profit target", () => {
    const p = minimumPriceFor(250, 10);
    expect(calculateFees({ pricePence: p, costPence: 10 }).netPence).toBeGreaterThanOrEqual(250);
    expect(calculateFees({ pricePence: p - 1, costPence: 10 }).netPence).toBeLessThan(250);
  });

  it("formats pounds", () => {
    expect(formatGBP(1234)).toBe("£12.34");
    expect(formatGBP(-5)).toBe("-£0.05");
  });
});
