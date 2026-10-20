// Marketing room: Promoter's pin copy and weekly content calendar.
import { describe, expect, it } from "vitest";
import { SELF, env } from "cloudflare:test";
import { getDb } from "../../src/worker/db";
import { planWeek, planWeekStart, promotableProducts, tidyDescription, writePins } from "../../src/worker/engine/marketing";
import type { AiServices, JsonRequest } from "../../src/worker/providers/ai";
import { BASE, setUpOwner } from "./helpers";

const now = new Date().toISOString();

async function addProduct(id: string, opts: { demo?: boolean; listing?: boolean; images?: boolean; stage?: string; live?: boolean } = {}) {
  const data: Record<string, unknown> = { format: "art", palette: ["#aa5533"] };
  if (opts.listing !== false) data.listing = { title: `Toadstool Print ${id} | Cottagecore Wall Art`, tags: ["toadstool print", "cottagecore art", "woodland decor"], description: "A cosy toadstool print. Prints up to A3." };
  if (opts.images !== false) data.keptImages = [`products/${id}/photo-1.jpg`, `products/${id}/photo-2.jpg`];
  if (opts.live) data.etsyLive = { state: "active", url: `https://www.etsy.com/listing/${id}` };
  await env.DB.prepare(`INSERT INTO products (id,title,niche,stage,seed,data,demo,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`)
    .bind(id, `Toadstool ${id}`, "toadstools", opts.stage ?? "launch", 1, JSON.stringify(data), opts.demo ? 1 : 0, now, now)
    .run();
}

const fakeAi = (log: string[] = []): AiServices => ({
  async json<T>(req: JsonRequest<T>): Promise<T> {
    log.push(req.key ?? "");
    const keys = Object.keys((req.jsonSchema as { properties: object }).properties);
    const out = keys.includes("titles")
      ? {
          titles: ["Cosy Toadstool Print for a Woodland Home", "x".repeat(140), "Cottagecore Wall Art #art"],
          description: `A soft toadstool print #cosy that brings the woods indoors. ${"Lovely words. ".repeat(50)} #toadstool #cottagecore #art #print #decor #extra #more`,
          boards: ["Cottagecore Home", "Gallery Wall Ideas"],
        }
      : {
          days: [1, 2, 3, 4, 5, 6, 7].map((day) => ({ day, channel: ["pinterest", "Instagram", "TikTok", "Myspace"][day % 4], productId: day === 3 ? "nope" : "pa", idea: `Idea ${day}`, caption: `Caption ${day} #toadstool` })),
        };
    return req.schema.parse(out);
  },
  async image() {
    return "";
  },
});

async function agent(key: string, method: string, path: string, body?: unknown) {
  const res = await SELF.fetch(`${BASE}/api/agent${path}`, {
    method,
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json()) as any };
}

describe("marketing room", () => {
  it("shows an empty list when no real product is finished, and won't plan", async () => {
    const c = await setUpOwner();
    await addProduct("demo1", { demo: true });
    await addProduct("nophotos", { images: false });
    await addProduct("nolisting", { listing: false });
    const r = await c.get("/api/marketing");
    expect(r.status).toBe(200);
    expect(r.data.products).toEqual([]);
    expect(r.data.calendar).toBeNull();
    expect((await c.post("/api/marketing/calendar", {})).status).toBe(400);
    expect((await c.post("/api/marketing/pins/demo1", {})).status).toBe(404);
  });

  it("lists finished products, live first, and writes, stores, rewrites and pins copy", async () => {
    const c = await setUpOwner();
    await addProduct("pa");
    await addProduct("pb", { stage: "live", live: true });
    const list = (await c.get("/api/marketing")).data.products;
    expect(list.map((p: any) => p.id)).toEqual(["pb", "pa"]);
    expect(list[0]).toMatchObject({ live: true, url: "https://www.etsy.com/listing/pb", accent: "#aa5533" });

    // AI is unavailable in tests: a simple template draft still appears.
    const r = await c.post("/api/marketing/pins/pa", {});
    expect(r.status).toBe(200);
    expect(r.data.copy.real).toBe(false);
    expect(r.data.copy.titles).toHaveLength(3);
    expect(r.data.copy.description.length).toBeLessThanOrEqual(500);
    const again = (await c.get("/api/marketing")).data.products.find((p: any) => p.id === "pa");
    expect(again.pins.copy.titles).toEqual(r.data.copy.titles);

    // Engine with real AI: tidy titles/hashtags, and a rewrite asks with a fresh key.
    const db = getDb(env.DB);
    const log: string[] = [];
    const p = (await promotableProducts(db)).find((x) => x.id === "pb")!;
    const copy = await writePins(db, fakeAi(log), p, false);
    expect(copy.titles).toHaveLength(3);
    expect(copy.titles.every((t) => t.length <= 100 && !t.includes("#"))).toBe(true);
    expect(copy.description.length).toBeLessThanOrEqual(500);
    const tags = copy.description.match(/#\w+/g)!;
    expect(tags.length).toBeLessThanOrEqual(5);
    expect(copy.description.trim().endsWith(tags[tags.length - 1])).toBe(true);
    expect(copy.boards).toEqual(["Cottagecore Home", "Gallery Wall Ideas"]);
    // Not a rewrite: stored copy is reused without asking again.
    const p2 = (await promotableProducts(db)).find((x) => x.id === "pb")!;
    await writePins(db, fakeAi(log), p2, false);
    expect(log).toHaveLength(1);
    const p3 = (await promotableProducts(db)).find((x) => x.id === "pb")!;
    const re = await writePins(db, fakeAi(log), p3, true);
    expect(re.rev).toBe(1);
    expect(log[1]).not.toBe(log[0]);

    // Pinned tracking.
    expect((await c.post("/api/marketing/pins/pb/pinned", { pinned: true })).data.pins.pinnedAt).toBeTruthy();
    const pb = (await c.get("/api/marketing")).data.products.find((x: any) => x.id === "pb");
    expect(pb.pins.pinnedAt).toBeTruthy();
    expect(pb.pins.copy.rev).toBe(1);
    expect((await c.post("/api/marketing/pins/pb/pinned", { pinned: false })).data.pins.pinnedAt).toBeNull();
  });

  it("keeps hashtags to the end and at most five", () => {
    const d = tidyDescription("Lovely #one print #two for #three your #four home #five #six.", []);
    expect(d).toBe("Lovely print for your home.\n\n#one #two #three #four #five");
    expect(tidyDescription("No tags here.", ["toadstool print"])).toBe("No tags here.\n\n#toadstoolprint");
  });

  it("plans next week Monday to Sunday and ticks days done", async () => {
    expect(planWeekStart(new Date("2026-10-19T10:00:00Z"))).toBe("2026-10-19"); // Monday → this week
    expect(planWeekStart(new Date("2026-10-20T10:00:00Z"))).toBe("2026-10-26"); // Tuesday → next Monday
    expect(planWeekStart(new Date("2026-10-25T10:00:00Z"))).toBe("2026-10-26"); // Sunday → tomorrow

    const c = await setUpOwner();
    await addProduct("pa");
    await addProduct("pb", { stage: "live", live: true });
    const db = getDb(env.DB);
    const list = await promotableProducts(db);
    const cal = await planWeek(db, fakeAi(), list, false, new Date("2026-10-20T10:00:00Z"));
    expect(cal.days.map((d) => d.date)).toEqual(["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]);
    expect(cal.days.every((d) => ["Pinterest", "Instagram", "TikTok"].includes(d.channel))).toBe(true);
    expect(cal.days.every((d) => d.productId === "pa" || d.productId === "pb")).toBe(true);
    expect(cal.days[0]).toMatchObject({ channel: "Instagram", productId: "pa", idea: "Idea 1", done: false });

    // Through the API (template plan, as AI is off in tests) and tick a day.
    const r = await c.post("/api/marketing/calendar", { replan: true });
    expect(r.status).toBe(200);
    expect(r.data.calendar.days).toHaveLength(7);
    const day = r.data.calendar.days[2].date;
    const t = await c.post("/api/marketing/calendar/done", { date: day, done: true });
    expect(t.data.calendar.days[2].done).toBe(true);
    expect((await c.get("/api/marketing")).data.calendar.days[2].done).toBe(true);
    expect((await c.post("/api/marketing/calendar/done", { date: "1999-01-01", done: true })).status).toBe(404);
  });

  it("waits for Claude, then picks up the answer", async () => {
    const c = await setUpOwner();
    await c.put("/api/settings", { demoMode: false, ai: { provider: "claude-code" } });
    const key = (await c.post("/api/claude/key")).data.key as string;
    await addProduct("pa");
    const r = await c.post("/api/marketing/pins/pa", {});
    expect(r.status).toBe(202);
    expect(r.data.pending).toBe(true);
    const job = (await agent(key, "GET", "/jobs")).data.jobs.find((j: any) => j.jsonSchema?.required?.includes("titles"));
    expect(job).toBeTruthy();
    const answer = { titles: ["A", "B", "C"], description: "A cosy print. #toadstool", boards: ["Cosy Home"] };
    expect((await agent(key, "POST", `/jobs/${encodeURIComponent(job.id)}/answer`, { answer: JSON.stringify(answer) })).status).toBe(200);
    const p = (await c.get("/api/marketing")).data.products[0];
    expect(p.pins.pendingRev).toBeNull();
    expect(p.pins.copy).toMatchObject({ titles: ["A", "B", "C"], real: true, boards: ["Cosy Home"] });
  });
});
