// Strategy: shop numbers (no AI), Manager's weekly report, and the Monday cron guard.
import { describe, expect, it } from "vitest";
import { SELF, env } from "cloudflare:test";
import { getDb } from "../../src/worker/db";
import { products } from "../../src/worker/db/schema";
import { getSettings, kvGet } from "../../src/worker/lib/store";
import { recordSale } from "../../src/worker/engine/queue";
import { isoWeek, listReports, strategyTick, writeReport, type StrategyReport } from "../../src/worker/engine/strategy";
import type { AiServices, JsonRequest } from "../../src/worker/providers/ai";
import { BASE, setUpOwner } from "./helpers";

const DAY = 86_400_000;

const ANSWER = {
  headline: "A quiet but steady week.",
  wentWell: ["Spreadsheets sold well"],
  didnt: ["No new listings went live"],
  nextSteps: [
    { text: "Make another budget spreadsheet", room: "research" },
    { text: "Review the listing that expires soon", room: "launch" },
    { text: "Something odd", room: "nowhere" },
  ],
};

function testAi(log: JsonRequest<unknown>[] = []): AiServices {
  return {
    async json<T>(req: JsonRequest<T>): Promise<T> {
      log.push(req as JsonRequest<unknown>);
      return req.schema.parse(ANSWER);
    },
    async image() {
      return "";
    },
  };
}

async function setup() {
  const owner = await setUpOwner();
  await owner.put("/api/settings", { demoMode: false });
  const db = getDb(env.DB);
  const settings = await getSettings(db);
  return { owner, db, settings };
}

async function addProduct(db: ReturnType<typeof getDb>, id: string, title: string, format: string, extra: Record<string, unknown> = {}, stage = "launch") {
  const at = new Date().toISOString();
  await db.insert(products).values({ id, title, niche: title, stage, seed: 1, data: { format, ...extra }, demo: false, createdAt: at, updatedAt: at });
}

describe("Strategy numbers", () => {
  it("are all zero for an empty shop", async () => {
    const { owner } = await setup();
    const r = await owner.get("/api/strategy/numbers");
    expect(r.status).toBe(200);
    const n = r.data;
    expect(n.week).toMatchObject({ days: 7, sales: 0, revenuePence: 0, feesPence: 0, costsPence: 0, aiSpendPence: 0, netPence: 0, bestSellers: [], pipeline: { started: 0, drafted: 0, live: 0, dropped: 0 } });
    expect(n.week.byFormat.map((f: { format: string }) => f.format)).toEqual(["art", "excel", "pdf"]);
    expect(n.month.days).toBe(28);
    expect(n.liveListings).toBe(0);
    expect(n.expiringSoon).toEqual([]);
    expect(n.weekly).toHaveLength(8);
    expect(n.weekly.every((w: { netPence: number }) => w.netPence === 0)).toBe(true);
  });

  it("add up ledger sales, formats, best sellers, the pipeline and expiring listings", async () => {
    const { owner, db, settings } = await setup();
    const now = Date.now();
    await addProduct(db, "p_budget", "Budget Planner Spreadsheet", "excel", { etsy: { listingId: 1, at: new Date(now - DAY).toISOString() } });
    await addProduct(db, "p_art", "Toadstool Print", "art", { etsyLive: { state: "active", endsAt: new Date(now + 5 * DAY).toISOString(), views: 1, favourites: 0, checkedAt: "" }, launchedAt: new Date(now - 2 * DAY).toISOString() }, "live");
    await recordSale(db, settings, { pricePence: 800, description: "Budget Planner Spreadsheet", productId: "p_budget", demo: false, date: new Date(now - DAY).toISOString() });
    await recordSale(db, settings, { pricePence: 800, description: "Budget Planner Spreadsheet", productId: "p_budget", demo: false, date: new Date(now - 2 * DAY).toISOString() });
    await recordSale(db, settings, { pricePence: 400, description: "Toadstool Print", productId: "p_art", demo: false, date: new Date(now - 3 * DAY).toISOString() });
    // Last week's sale, typed in by hand (not linked to a product).
    expect((await owner.post("/api/finance/sales", { pricePence: 500, description: "Old sale", date: new Date(now - 10 * DAY).toISOString() })).status).toBe(200);
    // Demo rows don't count when demo mode is off.
    await recordSale(db, settings, { pricePence: 9999, description: "Demo", demo: true, date: new Date(now - DAY).toISOString() });

    const n = (await owner.get("/api/strategy/numbers")).data;
    expect(n.week.sales).toBe(3);
    expect(n.week.revenuePence).toBe(2000);
    expect(n.week.feesPence).toBeGreaterThan(0);
    expect(n.week.netPence).toBe(2000 - n.week.feesPence);
    expect(n.week.bestSellers[0]).toMatchObject({ productId: "p_budget", format: "excel", sales: 2, revenuePence: 1600 });
    const excel = n.week.byFormat.find((f: { format: string }) => f.format === "excel");
    expect(excel).toMatchObject({ sales: 2, revenuePence: 1600, share: 80 });
    expect(n.week.pipeline).toMatchObject({ started: 2, drafted: 1, live: 1, dropped: 0 });
    expect(n.prevWeek).toMatchObject({ sales: 1, revenuePence: 500 });
    expect(n.prevWeek.byFormat.find((f: { format: string }) => f.format === "unlinked")).toMatchObject({ sales: 1 });
    expect(n.month.sales).toBe(4);
    expect(n.liveListings).toBe(1);
    expect(n.expiringSoon).toHaveLength(1);
    expect(n.expiringSoon[0]).toMatchObject({ productId: "p_art", daysLeft: 5 });
    expect(n.weekly.reduce((a: number, w: { sales: number }) => a + w.sales, 0)).toBe(4);
  });
});

describe("Manager's weekly report", () => {
  it("is written from the numbers only, stored newest first, and rewritten on request", async () => {
    const { db, settings } = await setup();
    await addProduct(db, "p_budget", "Budget Planner Spreadsheet", "excel");
    await recordSale(db, settings, { pricePence: 800, description: "Budget Planner Spreadsheet", productId: "p_budget", demo: false, date: new Date(Date.now() - DAY).toISOString() });
    const log: JsonRequest<unknown>[] = [];
    const r = await writeReport(db, settings, testAi(log));
    expect(r.headline).toBe(ANSWER.headline);
    expect(r.nextSteps).toEqual([
      { text: "Make another budget spreadsheet", room: "research" },
      { text: "Review the listing that expires soon", room: "launch" },
      { text: "Something odd", room: null },
    ]);
    expect(r.numbers.week.sales).toBe(1);
    expect(log[0].prompt).toContain("Sales: 1; revenue £8.00");
    expect(log[0].system).toMatch(/never invent/);
    expect(log[0].key).toBe(`strategy:${isoWeek(new Date())}:r0`);

    // "Write this week's report now" again: a fresh request, same week's slot replaced.
    const again = await writeReport(db, settings, testAi(log));
    expect(again.redo).toBe(1);
    expect(log[1].key).toBe(`strategy:${isoWeek(new Date())}:r1`);
    expect(await listReports(db)).toHaveLength(1);

    // Older weeks build up, newest first, keeping 12.
    for (let i = 1; i <= 13; i++) await writeReport(db, settings, testAi(), { now: new Date(Date.now() - i * 7 * DAY) });
    const all = await listReports(db);
    expect(all).toHaveLength(12);
    expect(all[0].week).toBe(isoWeek(new Date()));
    expect(all.map((x) => x.week)).toEqual([...all.map((x) => x.week)].sort().reverse());
  });

  it("says the little-data case to the AI, and needs real AI over HTTP", async () => {
    const { owner, db, settings } = await setup();
    const log: JsonRequest<unknown>[] = [];
    await writeReport(db, settings, testAi(log));
    expect(log[0].prompt).toMatch(/no sales and no live listings yet/);
    expect((await owner.post("/api/strategy/report")).status).toBe(400);
    const list = (await owner.get("/api/strategy/reports")).data;
    expect(list).toMatchObject({ pending: false, aiOn: false });
    expect(list.reports).toHaveLength(1);
  });

  it("waits on Claude's to-do list and picks the answer up later", async () => {
    const owner = await setUpOwner();
    await owner.put("/api/settings", { demoMode: false, ai: { enabled: true, provider: "claude-code" } });
    const key = (await owner.post("/api/claude/key")).data.key as string;
    const first = await owner.post("/api/strategy/report");
    expect(first.status).toBe(202);
    expect(first.data.pending).toBe(true);
    expect((await owner.get("/api/strategy/reports")).data).toMatchObject({ pending: true, reports: [] });
    // Pressing again doesn't add a second job.
    expect((await owner.post("/api/strategy/report")).status).toBe(202);
    const agent = async (method: string, path: string, body?: unknown) =>
      (await SELF.fetch(`${BASE}/api/agent${path}`, { method, headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) })).json() as Promise<any>;
    const jobs = (await agent("GET", "/jobs")).jobs;
    expect(jobs).toHaveLength(1);
    expect(jobs[0].jsonSchema.required).toContain("nextSteps");
    await agent("POST", `/jobs/${encodeURIComponent(jobs[0].id)}/claim`, {});
    await agent("POST", `/jobs/${encodeURIComponent(jobs[0].id)}/answer`, { answer: JSON.stringify(ANSWER) });
    const after = (await owner.get("/api/strategy/reports")).data;
    expect(after.pending).toBe(false);
    expect(after.reports[0].headline).toBe(ANSWER.headline);
  });
});

describe("Weekly cron", () => {
  it("writes once per ISO week, from Monday 07:00 UTC, only with real AI", async () => {
    const { db, settings } = await setup();
    const log: JsonRequest<unknown>[] = [];
    const ai = testAi(log);
    const at = (s: string) => new Date(s);
    // 2026-10-19 is a Monday.
    expect(await strategyTick(db, settings, null, at("2026-10-19T09:00:00Z"))).toBe("skipped");
    expect(await strategyTick(db, settings, ai, at("2026-10-18T23:00:00Z"))).toBe("written"); // Sunday: still last week's slot
    expect(await strategyTick(db, settings, ai, at("2026-10-19T06:55:00Z"))).toBe("skipped");
    expect(await strategyTick(db, settings, ai, at("2026-10-19T07:05:00Z"))).toBe("written");
    expect(await strategyTick(db, settings, ai, at("2026-10-19T07:10:00Z"))).toBe("skipped");
    expect(await strategyTick(db, settings, ai, at("2026-10-22T12:00:00Z"))).toBe("skipped");
    expect(await strategyTick(db, settings, ai, at("2026-10-26T07:30:00Z"))).toBe("written");
    expect(log).toHaveLength(3);
    expect(await kvGet<string>(db, "strategyWeekly")).toBe("2026-W44");
    const reports = await listReports(db);
    expect(reports.map((r: StrategyReport) => r.week)).toEqual(["2026-W44", "2026-W43", "2026-W42"]);
    expect(reports.every((r) => r.auto)).toBe(true);
  });
});
