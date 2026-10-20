// Only ideas you send go on the task board: demo mode never adds any by itself.
import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { getDb } from "../../src/worker/db";
import { getSettings } from "../../src/worker/lib/store";
import { tick } from "../../src/worker/engine/queue";
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
});
