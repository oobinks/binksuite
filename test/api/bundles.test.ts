// 🎁 Bundles: ideas from your finished products, then build → listing → price → launch.
import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { getDb } from "../../src/worker/db";
import { getSettings } from "../../src/worker/lib/store";
import { approveTask, tick } from "../../src/worker/engine/queue";
import { fakeAi } from "../../src/worker/providers/fakeAi";
import type { AiServices, JsonRequest } from "../../src/worker/providers/ai";
import { setUpOwner } from "./helpers";

const now = new Date().toISOString();
async function finishedProduct(id: string, title: string, format: string, pricePence: number, tags: string[], extra: Record<string, unknown> = {}) {
  const data = { format, zipKey: `products/${id}/pack.zip`, keptImages: [`products/${id}/cover.jpg`], listing: { title, tags, description: "x", designedBy: "seller" }, ...extra };
  await env.DB.prepare("INSERT INTO products (id, title, niche, stage, seed, price_pence, data, demo, created_at, updated_at) VALUES (?, ?, ?, 'live', 1, ?, ?, 0, ?, ?)")
    .bind(id, title, title, pricePence, JSON.stringify(data), now, now)
    .run();
}

const taskOf = async (productId: string, kind: string) =>
  env.DB.prepare("SELECT * FROM tasks WHERE product_id = ? AND kind = ? ORDER BY created_at DESC").bind(productId, kind).first<any>();
const dataOf = async (productId: string) => JSON.parse((await env.DB.prepare("SELECT data FROM products WHERE id = ?").bind(productId).first<any>()).data);

async function runUntil(db: any, settings: any, ai: AiServices, predicate: () => Promise<boolean>, max = 30) {
  for (let i = 0; i < max; i++) {
    await env.DB.prepare("UPDATE tasks SET started_at = '2000-01-01T00:00:00.000Z' WHERE state = 'working'").run();
    await tick(db, settings, { interactive: false, ai, files: env.FILES });
    if (await predicate()) return;
  }
  throw new Error("pipeline didn't reach the expected state");
}

describe("bundles", () => {
  it("suggests bundles from shared themes and takes one all the way to the Launch Pad", async () => {
    const owner = await setUpOwner();
    const db = getDb(env.DB);
    const settings = { ...(await getSettings(db)), demoMode: false };
    await finishedProduct("pb1", "Monthly Budget Spreadsheet", "excel", 499, ["budget spreadsheet", "monthly budget"]);
    await finishedProduct("pb2", "Debt Payoff Tracker", "excel", 399, ["debt tracker", "budget planner"]);
    await finishedProduct("pb3", "Frog Wall Art", "art", 299, ["frog print"]);
    await finishedProduct("pb4", "Unfinished Budget Thing", "excel", 0, ["budget"], { listing: undefined });

    const list = (await owner.get("/api/bundles")).data;
    expect(list.candidates.map((c: any) => c.id).sort()).toEqual(["pb1", "pb2", "pb3"]);
    expect(list.ideas[0]).toMatchObject({ name: "The Budget Bundle", theme: "budget", ids: ["pb1", "pb2"] });

    expect((await owner.post("/api/bundles", { name: "Too small", ids: ["pb1"], savePercent: 30 })).status).toBe(400);
    expect((await owner.post("/api/bundles", { name: "Has an unfinished one", ids: ["pb1", "pb4"], savePercent: 30 })).status).toBe(400);
    const made = await owner.post("/api/bundles", { name: "The Budget Bundle", ids: ["pb1", "pb2"], savePercent: 30, theme: "budget" });
    expect(made.status).toBe(200);
    const id = made.data.productId;
    const bundle = (await dataOf(id)).bundle;
    expect(bundle.items.map((i: any) => [i.id, i.pricePence])).toEqual([
      ["pb1", 499],
      ["pb2", 399],
    ]);
    expect((await dataOf(id)).format).toBe("excel");

    // Printer: built on your device; approving needs the bundle's own ZIP.
    const prompts: string[] = [];
    const ai: AiServices = { json: <T,>(r: JsonRequest<T>) => (prompts.push(r.prompt), fakeAi.json(r)), image: fakeAi.image };
    await runUntil(db, settings, ai, async () => (await taskOf(id, "bundle_build"))?.state === "needs_approval");
    const build = await taskOf(id, "bundle_build");
    expect(JSON.parse(build.output).bundle.items).toHaveLength(2);
    await expect(approveTask(db, build.id, settings, undefined, { zipKey: "products/pb1/pack.zip" })).rejects.toThrow(/Build the files first/);
    await approveTask(db, build.id, settings, undefined, { zipKey: `products/${id}/b.zip`, files: ["Read me first.txt"], previews: [`products/${id}/l1.jpg`] });

    // Straight to the Copywriter (no mockups), then Pricer: a real saving, never at or above separately.
    await runUntil(db, settings, ai, async () => (await taskOf(id, "price"))?.state === "needs_approval");
    expect(await taskOf(id, "mockups")).toBeNull();
    expect(prompts.at(-1)).toMatch(/This is a BUNDLE of 2 products/);
    expect(prompts.at(-1)).toMatch(/Main search phrase: "budget spreadsheet bundle"/);
    const price = await taskOf(id, "price");
    const out = JSON.parse(price.output);
    expect(out.separatePence).toBe(898);
    expect(out.pricePence).toBe(649); // ~30% off £8.98, rounded to a friendly price
    expect(out.savePercent).toBe(27);
    await expect(approveTask(db, price.id, settings, undefined, { pricePence: 898 })).rejects.toThrow(/less than buying/);
    await approveTask(db, price.id, settings, undefined, { pricePence: 599 });

    // Compliance → Launch Pad: the description states the saving from the final price.
    await runUntil(db, settings, ai, async () => (await taskOf(id, "compliance_check"))?.state === "needs_approval");
    await approveTask(db, (await taskOf(id, "compliance_check")).id, settings, "ok fine");
    await runUntil(db, settings, ai, async () => (await taskOf(id, "launch_pack"))?.state === "needs_approval");
    const launch = JSON.parse((await taskOf(id, "launch_pack")).output);
    expect(launch.bundle).toMatchObject({ separatePence: 898, savePercent: 33 });
    expect(launch.listing.description).toMatch(/✦ BETTER VALUE\nBought separately, these cost £8\.98\. As a bundle: £5\.99 \(save 33%\)\.\n\n✦ PLEASE NOTE/);
    expect(launch.images).toEqual([`products/${id}/l1.jpg`]);
    // A bundle can't go into another bundle.
    expect((await owner.get("/api/bundles")).data.candidates.map((c: any) => c.id)).not.toContain(id);
  });
});
