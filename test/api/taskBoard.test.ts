// Only ideas you send go on the task board: demo mode never adds any by itself.
import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { getDb } from "../../src/worker/db";
import { getSettings } from "../../src/worker/lib/store";
import { dropTask, listSuggestions, suggestIdea, tick } from "../../src/worker/engine/queue";
import { setUpOwner } from "./helpers";

describe("task board", () => {
  it("demo mode doesn't add ideas to the board by itself", async () => {
    const owner = await setUpOwner();
    await owner.put("/api/settings", { demoMode: true });
    const db = getDb(env.DB);
    const settings = await getSettings(db);
    const count = async () => (await env.DB.prepare("SELECT count(*) AS n FROM products").first<{ n: number }>())!.n;
    const before = await count();
    const later = new Date(Date.now() + 10 * 60_000);
    const r = await tick(db, settings, { interactive: true, now: later });
    expect(r.spawned).toBe(0);
    expect(await count()).toBe(before);
  });

  it("dropping an idea only removes it for now: its niche can be suggested again", async () => {
    const owner = await setUpOwner();
    await owner.put("/api/settings", { demoMode: false });
    const db = getDb(env.DB);
    const settings = await getSettings(db);
    const keyword = "drop test planner";
    await env.DB.prepare("INSERT INTO trend_niches (keyword, category, score, source, last_suggested) VALUES (?, 'yours', 50, 'ai', ?)").bind(keyword, new Date().toISOString()).run();
    const p = await suggestIdea(db, settings, "Drop test planner", undefined, false, { trendKeyword: keyword, origin: "radar" });
    const t = await env.DB.prepare("SELECT id FROM tasks WHERE product_id = ?").bind(p.id).first<{ id: string }>();
    await dropTask(db, t!.id);
    const n = await env.DB.prepare("SELECT last_suggested FROM trend_niches WHERE keyword = ?").bind(keyword).first<{ last_suggested: string | null }>();
    expect(n!.last_suggested).toBeNull();
    expect((await listSuggestions(db, false)).some((s) => s.productId === p.id)).toBe(false);
  });
});
