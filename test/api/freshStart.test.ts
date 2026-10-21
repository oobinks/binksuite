// Start fresh: every product and its work goes; money, orders, settings and today's ideas stay.
import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { getDb } from "../../src/worker/db";
import { getSettings, kvGet, kvSet } from "../../src/worker/lib/store";
import { suggestIdea } from "../../src/worker/engine/queue";
import { setUpOwner } from "./helpers";

const count = async (sql: string) => (await env.DB.prepare(sql).first<{ n: number }>())!.n;

describe("start fresh", () => {
  it("removes every product but keeps money, settings and today's ideas", async () => {
    const c = await setUpOwner();
    await c.post("/api/demo/reset");
    const db = getDb(env.DB);
    const settings = await getSettings(db);
    const p = await suggestIdea(db, settings, "Budget planner spreadsheet", undefined, true, { format: "excel" });
    await env.FILES.put(`products/${p.id}/planner.xlsx`, "x");
    const day = new Date().toISOString().slice(0, 10);
    await kvSet(db, `daily:${day}`, { date: day, at: new Date().toISOString(), pickedId: "i1", items: [{ id: "i1", keyword: "budget", idea: "Budget planner", angle: "a", productId: p.id }, { id: "i2", keyword: "habit", idea: "Habit tracker", angle: "b" }] });
    await kvSet(db, `pins:${p.id}`, { titles: ["x"] });
    await kvSet(db, "etsyOrders", [{ receiptId: 1 }]);
    await env.DB.prepare("INSERT INTO ledger (id, date, kind, category, description, amount_pence, product_id, demo, created_at) VALUES ('real1', ?, 'sale', 'Etsy sale', 'Real sale', 499, ?, 0, ?)")
      .bind(new Date().toISOString(), p.id, new Date().toISOString())
      .run();
    expect(await count("SELECT count(*) AS n FROM products")).toBeGreaterThan(1);

    expect((await c.post("/api/fresh-start", {})).status).toBe(400);
    const r = await c.post("/api/fresh-start", { confirm: "DELETE" });
    expect(r.status).toBe(200);
    expect(r.data.files).toBe(1);

    expect(await count("SELECT count(*) AS n FROM products")).toBe(0);
    expect(await count("SELECT count(*) AS n FROM tasks WHERE product_id IS NOT NULL")).toBe(0);
    expect(await count("SELECT count(*) AS n FROM approvals")).toBe(0);
    expect(await count("SELECT count(*) AS n FROM ledger WHERE demo = 1")).toBe(0);
    expect((await env.FILES.list({ prefix: "products/" })).objects).toHaveLength(0);
    expect(await kvGet(db, `pins:${p.id}`)).toBeNull();
    // Kept: the real sale, Etsy orders, today's ideas (back to "not sent yet").
    expect(await count("SELECT count(*) AS n FROM ledger WHERE id = 'real1'")).toBe(1);
    expect(await kvGet(db, "etsyOrders")).toEqual([{ receiptId: 1 }]);
    const daily = await kvGet<{ pickedId?: string; items: { id: string; productId?: string }[] }>(db, `daily:${day}`);
    expect(daily!.items.map((i) => i.id)).toEqual(["i1", "i2"]);
    expect(daily!.items.every((i) => !i.productId)).toBe(true);
    expect(daily!.pickedId).toBeUndefined();
    expect((await getSettings(db)).demoMode).toBe(false);
  });
});
