import { describe, expect, it } from "vitest";
import { readMarket, trendScore, undercutPrice, priceAlert } from "../../src/shared/market";
import { toGbpPence } from "../../src/worker/providers/etsy";

const now = new Date("2026-10-16T12:00:00Z");
const ago = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

describe("market read", () => {
  it("works out median, low end and momentum of new listings", () => {
    const m = readMarket(
      [
        { pricePence: 300, favourites: 20, createdAt: ago(10) }, // 2/day
        { pricePence: 500, favourites: 10, createdAt: ago(5) }, // 2/day
        { pricePence: 400, favourites: 500, createdAt: ago(400) }, // old, ignored for momentum
        { pricePence: 250, favourites: 0, createdAt: ago(40) },
      ],
      3000,
      now,
    )!;
    expect(m.medianPricePence).toBe(400);
    expect(m.lowPricePence).toBe(300);
    expect(m.favsPerDay).toBeCloseTo(1.33, 1);
    expect(m.newListings30d).toBe(2);
    expect(m.score).toBeGreaterThan(0);
  });
  it("scores rising, uncrowded niches higher", () => {
    expect(trendScore(3, 2000)).toBeGreaterThan(trendScore(3, 200000));
    expect(trendScore(5, 5000)).toBeGreaterThan(trendScore(0.2, 5000));
    expect(trendScore(0, 100)).toBe(0);
  });
  it("undercuts with charm pricing but never below the profit floor", () => {
    expect(undercutPrice(500, 10, 300)).toBe(449);
    expect(undercutPrice(400, 10, 300)).toBe(349);
    expect(undercutPrice(300, 50, 280)).toBe(280);
  });
  it("flags prices too far above the market", () => {
    expect(priceAlert(599, 450, 10)).toEqual({ tooHigh: true, percentAbove: 33 });
    expect(priceAlert(470, 450, 10).tooHigh).toBe(false);
  });
  it("converts Etsy prices to GBP", () => {
    expect(toGbpPence({ amount: 499, divisor: 100, currency_code: "GBP" }, 0.79)).toBe(499);
    expect(toGbpPence({ amount: 500, divisor: 100, currency_code: "USD" }, 0.79)).toBe(395);
    expect(toGbpPence({ amount: 500, divisor: 100, currency_code: "JPY" }, 0.79)).toBeNull();
  });
});
