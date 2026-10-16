import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { setUpOwner } from "./helpers";

async function priceTask(c: any) {
  for (let i = 0; i < 4; i++) {
    await env.DB.prepare("UPDATE tasks SET started_at = '2000-01-01T00:00:00.000Z' WHERE state = 'working'").run();
    await c.get("/api/state");
  }
  return (await c.get("/api/rooms/listing")).data.tasks.find((t: any) => t.kind === "price" && t.state === "needs_approval");
}

describe("listing office pricing", () => {
  it("saves competitor prices and lets you set your own price on approval", async () => {
    const c = await setUpOwner();
    const t = await priceTask(c);
    expect(t.output.searchQuery).toBeTruthy();

    const saved = await c.put(`/api/products/${t.productId}/competitors`, { competitors: [{ pricePence: 450, note: "set of 3" }, { pricePence: 299 }] });
    expect(saved.status).toBe(200);
    const info = (await c.get(`/api/products/${t.productId}`)).data;
    expect(info.competitors).toHaveLength(2);
    expect(info.competitors[0].note).toBe("set of 3");

    expect((await c.post(`/api/tasks/${t.id}/approve`, { data: { pricePence: 5 } })).status).toBe(400);
    expect((await c.post(`/api/tasks/${t.id}/approve`, { data: { pricePence: 375 } })).status).toBe(200);
    const row = await env.DB.prepare("SELECT price_pence FROM products WHERE id = ?").bind(t.productId).first<any>();
    expect(row.price_pence).toBe(375);
  });

  it("rejects bad competitor input", async () => {
    const c = await setUpOwner();
    const t = await priceTask(c);
    expect((await c.put(`/api/products/${t.productId}/competitors`, { competitors: [{ pricePence: -1 }] })).status).toBe(400);
  });
});
