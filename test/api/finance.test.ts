import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { setUpOwner } from "./helpers";

describe("finance vault", () => {
  it("records a real sale with fees, and real entries survive leaving demo mode", async () => {
    const c = await setUpOwner();
    const sale = await c.post("/api/finance/sales", { pricePence: 2500, description: "Real sale" });
    expect(sale.status).toBe(200);
    expect(sale.data.fees.totalFeesPence).toBe(349);

    await c.post("/api/finance/entries", { kind: "cost", category: "Software", description: "Fonts", amountPence: 300 });

    const clear = await c.post("/api/demo/clear", {});
    expect(clear.status).toBe(200);
    const summary = (await c.get("/api/finance/summary")).data;
    expect(summary.totals.salesPence).toBe(2500);
    expect(summary.totals.feesPence).toBe(349);
    expect(summary.totals.costsPence).toBe(300);
    expect(summary.totals.netPence).toBe(2500 - 349 - 300);
    expect(summary.taxYear.allowancePence).toBe(100000);
    expect(summary.taxYear.grossPence).toBe(2500);

    const state = (await c.get("/api/state")).data;
    expect(state.settings.demoMode).toBe(false);
    expect(state.game.coinsPence).toBe(2500 - 349 - 300);
    const { results } = await env.DB.prepare("SELECT count(*) n FROM products WHERE demo = 1").all<{ n: number }>();
    expect(results[0].n).toBe(0);
  });

  it("deleting a sale removes its fee line", async () => {
    const c = await setUpOwner();
    await c.post("/api/demo/clear", {});
    const sale = await c.post("/api/finance/sales", { pricePence: 1000, description: "Oops" });
    await c.del(`/api/finance/entries/${sale.data.saleId}`);
    const ledger = (await c.get("/api/finance/ledger")).data.entries;
    expect(ledger).toHaveLength(0);
  });

  it("validates input", async () => {
    const c = await setUpOwner();
    expect((await c.post("/api/finance/sales", { pricePence: -5, description: "x" })).status).toBe(400);
  });
});
