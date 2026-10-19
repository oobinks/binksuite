// The real-AI pipeline, driven directly through the engine with a fake AI
// (the real Workers AI binding isn't available in tests).
import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { getDb } from "../../src/worker/db";
import { getSettings } from "../../src/worker/lib/store";
import { approveTask, suggestIdea, tick } from "../../src/worker/engine/queue";
import type { AiServices, JsonRequest } from "../../src/worker/providers/ai";
import { kvSet } from "../../src/worker/lib/store";
import { setUpOwner } from "./helpers";

const fakeAi = (log: string[] = []): AiServices => ({
  async json<T>(req: JsonRequest<T>): Promise<T> {
    const keys = Object.keys((req.jsonSchema as { properties: object }).properties);
    log.push(`json:${keys[0]}`);
    let out: unknown;
    if (keys.includes("scores"))
      out = {
        scores: { demand: 8, competition: 4, aiFit: 9, pricePotential: 7 },
        summary: "Strong seasonal demand.",
        reasons: ["People search for it", "Not too crowded", "AI suits it"],
        risks: ["Seasonal"],
        angles: ["Bundle", "Minimal", "Kids"],
        keywords: ["Mushroom Wall Art!", "cottagecore print", "this keyword is far far too long for etsy"],
        priceLowGBP: 3.5,
        priceHighGBP: 6,
        seasonality: "Autumn",
      };
    else if (keys.includes("imagePrompts"))
      out = {
        productTitle: "Cottage Mushroom Prints",
        audience: "Plant lovers",
        style: "watercolour",
        palette: ["#aa5533", "nope"],
        imagePrompts: ["a red mushroom", "a mushroom ring"],
        boosters: [
          { kind: "slogan", title: "Catchy slogan", why: "giftable", slogans: ["“Grow wild”", "Stay cosy"] },
          { kind: "art", title: "Retro colours", why: "stands out", artHint: "bold retro palette" },
          { kind: "bundle", title: "Set of 3", why: "sells more", listingHint: "Matching set of 3" },
        ],
      };
    else if (keys.includes("ideas")) out = { ideas: [{ idea: "Frog teacher posters", why: "Back to school" }] };
    else out = { title: "Cottage Mushroom Wall Art Printable Disney", tags: ["mushroom art", "cottagecore"], intro: "A lovely set of mushroom prints.", features: ["Earthy colours", "• Prints up to A3"] };
    return req.schema.parse(out);
  },
  async image(prompt: string) {
    log.push("image");
    log.push(`prompt:${prompt}`);
    return btoa("fake-jpeg");
  },
});

async function setup() {
  await setUpOwner();
  const db = getDb(env.DB);
  const settings = await getSettings(db);
  return { db, settings };
}

async function runUntil(db: any, settings: any, ai: AiServices, predicate: () => Promise<boolean>, max = 30) {
  for (let i = 0; i < max; i++) {
    await env.DB.prepare("UPDATE tasks SET started_at = '2000-01-01T00:00:00.000Z' WHERE state = 'working'").run();
    await tick(db, settings, { interactive: false, ai, files: env.FILES });
    if (await predicate()) return;
  }
  throw new Error("pipeline didn't reach the expected state");
}

const taskOf = async (productId: string, kind: string) =>
  env.DB.prepare("SELECT * FROM tasks WHERE product_id = ? AND kind = ? ORDER BY created_at DESC").bind(productId, kind).first<any>();

describe("real AI pipeline (Workers AI)", () => {
  it("researches, briefs, paints, and waits for you at each checkpoint", async () => {
    const { db, settings } = await setup();
    const calls: string[] = [];
    const ai = fakeAi(calls);
    const p = await suggestIdea(db, settings, "Cottagecore mushroom wall art", "for plant lovers", true);
    expect(p.demo).toBe(false);

    // Scout: real report, keywords tidied to Etsy's limits.
    await runUntil(db, settings, ai, async () => (await taskOf(p.id, "niche_score"))?.state === "needs_approval");
    const research = await taskOf(p.id, "niche_score");
    const report = JSON.parse(research.output);
    expect(report.verdict).toBe("go");
    expect(report.keywords).toContain("mushroom wall art");
    for (const k of report.keywords) expect(k.length).toBeLessThanOrEqual(20);
    expect(report.sources).toMatch(/can't browse/);
    await approveTask(db, research.id, settings);

    // Analyst pitches boosters; you pick a slogan (edited) and the retro twist.
    await runUntil(db, settings, ai, async () => (await taskOf(p.id, "brief"))?.state === "needs_approval");
    const brief = await taskOf(p.id, "brief");
    const offered = JSON.parse(brief.output).boosters;
    expect(offered.map((b: any) => b.kind)).toEqual(["slogan", "art", "bundle"]);
    expect(offered[0].slogans).toEqual(["Grow wild", "Stay cosy"]);
    await approveTask(db, brief.id, settings, undefined, { chosen: [{ id: offered[0].id, slogan: "Grow wild, stay cosy" }, { id: offered[1].id }], custom: "add a tiny snail" });

    // Designer: 4 images, one per tick, stored in R2, with your art boosters woven in.
    await runUntil(db, settings, ai, async () => (await taskOf(p.id, "inspect"))?.state === "needs_approval");
    const prompts = calls.filter((c) => c.startsWith("prompt:"));
    expect(prompts[0]).toMatch(/bold retro palette/);
    expect(prompts[0]).toMatch(/tiny snail/);
    expect(prompts[0]).not.toMatch(/Grow wild/); // slogans are added as real text by the Printer
    expect(calls.filter((c) => c === "image")).toHaveLength(4);
    const product = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(p.id).first<any>();
    expect(product.title).toBe("Cottage Mushroom Prints");
    expect(JSON.parse(product.data).slogan).toBe("Grow wild, stay cosy");
    const images = JSON.parse(product.data).images;
    expect(images).toHaveLength(4);
    expect(await (await env.FILES.get(images[0].key))!.text()).toBe(btoa("fake-jpeg"));

    // Inspector: you must keep at least one image.
    const inspect = await taskOf(p.id, "inspect");
    await expect(approveTask(db, inspect.id, settings, undefined, { kept: [] })).rejects.toThrow(/Keep at least one/);
    await approveTask(db, inspect.id, settings, undefined, { kept: [images[0].key, images[2].key] });

    // Printer waits for you to build files in the browser.
    await runUntil(db, settings, ai, async () => (await taskOf(p.id, "print_files"))?.state === "needs_approval");
    const print = await taskOf(p.id, "print_files");
    expect(JSON.parse(print.output).images).toHaveLength(2);
    expect(JSON.parse(print.output).slogan).toBe("Grow wild, stay cosy");
    await expect(approveTask(db, print.id, settings)).rejects.toThrow(/Build the print files/);
    await env.FILES.put(`products/${p.id}/pack.zip`, "zip");
    await approveTask(db, print.id, settings, undefined, { zipKey: `products/${p.id}/pack.zip`, files: ["a.pdf"] });

    // Stylist uses your kept art; Copywriter's listing is tidied and disclosed.
    await runUntil(db, settings, ai, async () => (await taskOf(p.id, "mockups"))?.state === "needs_approval");
    const mock = JSON.parse((await taskOf(p.id, "mockups")).output);
    expect(mock.mockups.map((m: any) => m.scene)).toEqual(["living", "nursery", "bedroom", "hallway"]);
    expect(mock.mockups[0].imageKey).toBe(images[0].key);
    // Each room was painted once and saved to the scene library for the next products.
    expect(calls.filter((c) => c.startsWith("prompt:") && /Nothing hanging on the wall/.test(c))).toHaveLength(4);
    expect((await env.FILES.list({ prefix: "products/_scenes/" })).objects).toHaveLength(4);
    await approveTask(db, (await taskOf(p.id, "mockups")).id, settings);
    await runUntil(db, settings, ai, async () => (await taskOf(p.id, "price"))?.state === "needs_approval");
    const listing = JSON.parse((await env.DB.prepare("SELECT data FROM products WHERE id = ?").bind(p.id).first<any>()).data).listing;
    expect(listing.title).not.toMatch(/disney/i);
    expect(listing.description).toMatch(/^This design was created with AI assistance/);
    expect(listing.description).toMatch(/✦ FEATURES\n• Earthy colours\n• Prints up to A3/);
    expect(listing.description).toMatch(/✦ WHAT'S INCLUDED\n• 2 designs as high-resolution PDF files/);
    expect(listing.description).toMatch(/✦ HOW IT WORKS\n1\. /);
    // No Etsy key here: Scout's keywords top up the tags to all 13.
    expect(listing.tags).toHaveLength(13);
    expect(listing.tags).toContain("cottagecore print");
    expect(listing.tags).not.toContain("this keyword is far far too long for etsy".slice(0, 20));
  });

  it("never runs the same job twice (lease)", async () => {
    const { db, settings } = await setup();
    const calls: string[] = [];
    const ai = fakeAi(calls);
    const p = await suggestIdea(db, settings, "Frog teacher posters", undefined, true);
    await tick(db, settings, { interactive: false, ai, files: env.FILES }); // claim
    const pending: Promise<unknown>[] = [];
    const defer = (j: Promise<unknown>) => pending.push(j);
    await Promise.all([
      tick(db, settings, { interactive: false, ai, files: env.FILES, defer }),
      tick(db, settings, { interactive: false, ai, files: env.FILES, defer }),
    ]);
    await Promise.all(pending);
    expect(calls.filter((c) => c === "json:scores")).toHaveLength(1);
    expect((await taskOf(p.id, "niche_score")).state).toBe("needs_approval");
  });

  it("pauses (⛔) when the free daily allowance runs out", async () => {
    const { db, settings } = await setup();
    const calls: string[] = [];
    const ai = fakeAi(calls);
    const day = new Date().toISOString().slice(0, 10);
    await kvSet(db, `aiUsage:${day}`, { day, calls: 50, neurons: settings.ai.dailyNeuronCap - 100 });
    const p = await suggestIdea(db, settings, "Owl nursery prints", undefined, true);
    await tick(db, settings, { interactive: false, ai, files: env.FILES });
    await tick(db, settings, { interactive: false, ai, files: env.FILES });
    const t = await taskOf(p.id, "niche_score");
    expect(t.state).toBe("blocked");
    expect(t.error).toMatch(/free AI allowance/);
    expect(calls).toHaveLength(0);
  });

  it("holds real products when AI is unavailable instead of faking them", async () => {
    const { db, settings } = await setup();
    const p = await suggestIdea(db, settings, "Owl nursery prints", undefined, true);
    await tick(db, settings, { interactive: false, ai: null, files: env.FILES });
    const t = await taskOf(p.id, "niche_score");
    expect(t.state).toBe("blocked");
    expect(t.error).toMatch(/isn't available/);
  });
});
