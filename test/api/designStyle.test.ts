// Each product's design style: picked once (unlike the last few products), then kept.
import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { getDb } from "../../src/worker/db";
import { getSettings } from "../../src/worker/lib/store";
import { suggestIdea } from "../../src/worker/engine/queue";
import { setUpOwner } from "./helpers";

describe("product design style", () => {
  it("picks a style unlike the last products', keeps it, and lets you change it", async () => {
    const c = await setUpOwner();
    const db = getDb(env.DB);
    const settings = await getSettings(db);
    const styles: string[] = [];
    for (const idea of ["Budget planner", "Meal planner", "Habit tracker", "Wedding planner"]) {
      const p = await suggestIdea(db, settings, idea, undefined, true, { format: "excel" });
      const r = await c.get(`/api/products/${p.id}/style`);
      expect(r.status).toBe(200);
      styles.push(r.data.style);
      // Asking again gives the same answer.
      expect((await c.get(`/api/products/${p.id}/style`)).data.style).toBe(r.data.style);
    }
    expect(new Set(styles).size).toBe(styles.length);

    const p = await suggestIdea(db, settings, "Savings tracker", undefined, true, { format: "pdf" });
    expect((await c.put(`/api/products/${p.id}/style`, { style: "editorial" })).status).toBe(200);
    expect((await c.get(`/api/products/${p.id}/style`)).data.style).toBe("editorial");
    expect((await c.put(`/api/products/${p.id}/style`, { style: "wild" })).status).toBe(400);
    expect((await c.get(`/api/products/nope/style`)).status).toBe(404);
  });
});
