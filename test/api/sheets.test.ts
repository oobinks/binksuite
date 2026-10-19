// 📊 EXCEL and 📄 PDF products through the real pipeline (with the stand-in AI).
import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { getDb } from "../../src/worker/db";
import { getSettings } from "../../src/worker/lib/store";
import { approveTask, rejectTask, suggestIdea, tick } from "../../src/worker/engine/queue";
import { fakeAi } from "../../src/worker/providers/fakeAi";
import type { AiServices, JsonRequest } from "../../src/worker/providers/ai";
import { setUpOwner } from "./helpers";
import { hasAiDisclosure } from "../../src/shared/compliance";

async function setup() {
  const owner = await setUpOwner();
  const db = getDb(env.DB);
  return { owner, db, settings: await getSettings(db) };
}

/** The stand-in AI, recording what each prompt asked for. */
function recording(prompts: string[]): AiServices {
  return {
    json<T>(req: JsonRequest<T>) {
      prompts.push(req.prompt);
      return fakeAi.json(req);
    },
    image: fakeAi.image,
  };
}

/** A stand-in for Etsy's search: the top listings, with their tags (one with a brand in it). */
function fakeEtsy(searches: string[]) {
  const listing = (title: string, tags: string[], favourites: number) => ({ id: 1, title, tags, favourites, pricePence: 399, views: null, createdAt: "", url: "", shopId: 1 });
  return {
    async search(keywords: string) {
      searches.push(keywords);
      return {
        total: 4210,
        listings: [
          listing("Christmas Gift Tracker | Excel Gift List | Holiday Budget", ["gift tracker", "christmas budget", "disney gift list", "gift list template"], 500),
          listing("Christmas Gift List Spreadsheet, Holiday Budget Planner", ["gift tracker", "christmas budget", "secret santa list"], 120),
          listing("Gift Tracker for Google Sheets | Holiday Budget", ["gift tracker", "gift list template", "disney gift list"], 30),
        ],
      };
    },
  } as any;
}

async function runUntil(db: any, settings: any, ai: AiServices, predicate: () => Promise<boolean>, max = 30, etsy?: any) {
  for (let i = 0; i < max; i++) {
    await env.DB.prepare("UPDATE tasks SET started_at = '2000-01-01T00:00:00.000Z' WHERE state = 'working'").run();
    await tick(db, settings, { interactive: false, ai, files: env.FILES, etsy: async () => etsy ?? null });
    if (await predicate()) return;
  }
  throw new Error("pipeline didn't reach the expected state");
}

const taskOf = async (productId: string, kind: string) =>
  env.DB.prepare("SELECT * FROM tasks WHERE product_id = ? AND kind = ? ORDER BY created_at DESC").bind(productId, kind).first<any>();
const dataOf = async (productId: string) => JSON.parse((await env.DB.prepare("SELECT data FROM products WHERE id = ?").bind(productId).first<any>()).data);

describe("spreadsheet products", () => {
  it("researches, designs, builds and lists an Excel product without any art steps", async () => {
    const { db, settings } = await setup();
    const prompts: string[] = [];
    const ai = recording(prompts);
    const p = await suggestIdea(db, settings, "Christmas gift list tracker", undefined, true, { format: "excel" });
    expect((await dataOf(p.id)).format).toBe("excel");

    await runUntil(db, settings, ai, async () => (await taskOf(p.id, "niche_score"))?.state === "needs_approval");
    expect(prompts.at(-1)).toMatch(/ready-made Excel spreadsheet/);
    await approveTask(db, (await taskOf(p.id, "niche_score")).id, settings);

    // Analyst designs the sheet; formulas are checked; boosters are features, not slogans.
    await runUntil(db, settings, ai, async () => (await taskOf(p.id, "brief"))?.state === "needs_approval");
    const brief = JSON.parse((await taskOf(p.id, "brief")).output);
    expect(brief.format).toBe("excel");
    expect(brief.sheet.tabs[0].columns.find((c: any) => c.header === "Left").formula).toBe("{Budget} - {Spent}");
    expect(brief.sheet.summary.map((s: any) => s.label)).toEqual(["Total budgeted", "Total spent", "Left to spend", "Gifts bought"]);
    expect(brief.boosters.map((b: any) => b.kind)).toEqual(["feature", "bundle"]);
    await approveTask(db, (await taskOf(p.id, "brief")).id, settings, undefined, { chosen: [{ id: brief.boosters[0].id }] });

    // Straight to the Printer's build step: no art, no inspection.
    await runUntil(db, settings, ai, async () => (await taskOf(p.id, "sheet_build"))?.state === "needs_approval");
    expect(await taskOf(p.id, "images")).toBeNull();
    expect(prompts.at(-1)).toMatch(/Add a card list tab/); // your chosen feature went into the redesign
    // Every design gets the senior designer's review before it's built.
    expect(prompts.at(-1)).toMatch(/First score the current design 1-10/);
    expect(JSON.parse((await taskOf(p.id, "sheet_build")).output).review).toMatchObject({ score: 8.6, fixes: [expect.stringMatching(/example rows/)] });
    const build = await taskOf(p.id, "sheet_build");
    expect(build.room).toBe("studio");
    expect(JSON.parse(build.output).sheet.tabs[0].name).toBe("Gifts");
    await expect(approveTask(db, build.id, settings)).rejects.toThrow(/Build the files first/);
    await approveTask(db, build.id, settings, undefined, {
      zipKey: `products/${p.id}/pack.zip`,
      files: ["tracker.xlsx", "tracker-printable-A4.pdf"],
      previews: [`products/${p.id}/p1.jpg`, `products/${p.id}/p2.jpg`, "products/someone-else/x.jpg"],
    });
    // The build's photo set is the listing photos (yours only).
    expect((await dataOf(p.id)).keptImages).toEqual([`products/${p.id}/p1.jpg`, `products/${p.id}/p2.jpg`]);

    // No room mockups for spreadsheets: straight to the Copywriter, and the listing talks about Excel.
    const searches: string[] = [];
    await runUntil(db, settings, ai, async () => (await taskOf(p.id, "price"))?.state === "needs_approval", 30, fakeEtsy(searches));
    expect(await taskOf(p.id, "mockups")).toBeNull();
    // Copywriter read what buyers search first (one Etsy search), then wrote for it.
    expect(searches).toHaveLength(1);
    expect(searches[0]).toMatch(/spreadsheet$/);
    expect(prompts.at(-1)).toMatch(/What buyers search for, read from the top of 4,210 Etsy results/);
    expect(prompts.at(-1)).toMatch(/- gift tracker \(3\)/);
    expect(prompts.at(-1)).not.toMatch(/disney/); // brands never make it in
    expect(prompts.at(-1)).toMatch(/Excel spreadsheet \(\.xlsx\) with \d+ tabs/);
    expect(prompts.at(-1)).toMatch(/Tabs: Dashboard; Gifts/);
    const listing = (await dataOf(p.id)).listing;
    expect(listing.tags).toEqual(expect.arrayContaining(["excel template", "google sheets"]));
    expect(hasAiDisclosure(listing.description)).toBe(true);
    expect(listing.description.match(/AI assistance/g)).toHaveLength(1);
    expect(listing.description).toMatch(/✦ WHAT'S INCLUDED\n• Excel spreadsheet \(\.xlsx\) with \d+ tabs/);
    expect(listing.tags).toHaveLength(13);
    expect(listing.tags).toEqual(expect.arrayContaining(["gift tracker", "christmas budget", "gift list template"]));
    const data = await dataOf(p.id);
    expect(data.seo).toMatchObject({ source: "etsy", competing: 4210 });
    expect(data.seo.keyword).toBe(searches[0]);
  });

  it("a PDF product skips the art too, and Redesign passes your note to the Analyst", async () => {
    const { db, settings } = await setup();
    const prompts: string[] = [];
    const ai = recording(prompts);
    const p = await suggestIdea(db, settings, "Christmas planner printable", undefined, true);
    expect((await dataOf(p.id)).format).toBe("pdf"); // guessed from the wording
    await runUntil(db, settings, ai, async () => (await taskOf(p.id, "niche_score"))?.state === "needs_approval");
    await approveTask(db, (await taskOf(p.id, "niche_score")).id, settings);
    await runUntil(db, settings, ai, async () => (await taskOf(p.id, "brief"))?.state === "needs_approval");
    await approveTask(db, (await taskOf(p.id, "brief")).id, settings);
    await runUntil(db, settings, ai, async () => (await taskOf(p.id, "sheet_build"))?.state === "needs_approval");
    const before = prompts.length;
    await rejectTask(db, (await taskOf(p.id, "sheet_build")).id, "add a column for wrapping paper");
    await runUntil(db, settings, ai, async () => (await taskOf(p.id, "sheet_build"))?.state === "needs_approval");
    expect(prompts.length).toBe(before + 1);
    expect(prompts.at(-1)).toMatch(/Owner's feedback: add a column for wrapping paper/);
    expect(prompts.at(-1)).toMatch(/printable PDF planner/);
  });

  it("shows the format on task cards and suggestions", async () => {
    const { owner, db, settings } = await setup();
    const excel = await suggestIdea(db, settings, "Monthly salary budget sheet", undefined, true);
    const art = await suggestIdea(db, settings, "Frog wall art", undefined, true, { format: "art" });
    const sug = (await owner.get("/api/research/suggestions")).data.suggestions;
    expect(sug.map((s: any) => s.format)).toEqual(["art", "excel"]);
    const room = (await owner.get("/api/rooms/research")).data;
    const formatFor = (id: string) => room.tasks.find((t: any) => t.productId === id).productFormat;
    expect([formatFor(excel.id), formatFor(art.id)]).toEqual(["excel", "art"]);
    expect((await owner.post("/api/research/suggestions", { idea: "Wedding budget", format: "pdf" })).status).toBe(200);
    expect((await owner.post("/api/research/suggestions", { idea: "Wedding budget", format: "word" })).status).toBe(400);
  });
});
