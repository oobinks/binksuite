import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { setUpOwner } from "./helpers";

describe("HQ, engine and game", () => {
  it("seeds a demo shop at level 3 with coins and work in progress", async () => {
    const c = await setUpOwner();
    const { data: s } = await c.get("/api/state");
    expect(s.game.level).toBe(3);
    expect(s.game.coinsPence).toBeGreaterThan(0);
    expect(s.rooms).toHaveLength(11);
    expect(s.agents).toHaveLength(13);
    // Every room is always open — nothing is locked behind levels.
    expect(s.rooms.every((r: any) => !("unlocked" in r))).toBe(true);
    expect(s.rooms.find((r: any) => r.id === "research").needsYou).toBe(1);
    expect(s.agents.find((a: any) => a.id === "scout").status).toBe("needs_you");
    expect(s.approvalsWaiting).toBeGreaterThanOrEqual(1);
    expect(s.briefingDue).toBe(true);
  });

  it("approving a task awards XP, hands the parcel on and completes quests", async () => {
    const c = await setUpOwner();
    const room = await c.get("/api/rooms/research");
    const task = room.data.tasks.find((t: any) => t.state === "needs_approval");
    expect(task.output.scores).toBeDefined();

    const before = (await c.get("/api/state")).data.game.xp;
    const r = await c.post(`/api/tasks/${task.id}/approve`, {});
    expect(r.status).toBe(200);
    expect(r.data.state).toBe("done");

    const after = await c.get("/api/state");
    expect(after.data.game.xp).toBeGreaterThan(before);
    // Approving twice is refused by the state machine.
    expect((await c.post(`/api/tasks/${task.id}/approve`, {})).status).toBe(400);

    // The Analyst now has a brief queued in the same room.
    const research = await c.get("/api/rooms/research");
    expect(research.data.tasks.some((t: any) => t.kind === "brief")).toBe(true);

    const quests = (await c.get("/api/quests")).data.quests;
    const clockIn = quests.find((q: any) => q.quest.id === "c1-clock-in");
    expect(clockIn.complete).toBe(true);
    const claim = await c.post("/api/quests/c1-clock-in/claim", {});
    expect(claim.status).toBe(200);
    expect((await c.post("/api/quests/c1-clock-in/claim", {})).status).toBe(400);

    const ach = (await c.get("/api/achievements")).data.achievements;
    expect(ach.find((a: any) => a.id === "first-approval").unlockedAt).not.toBeNull();
  });

  it("runs work through the queue: claim → progress → finish → hand off", async () => {
    const c = await setUpOwner();
    // Make every queued step instantly finishable by rewinding start times.
    for (let i = 0; i < 4; i++) {
      await env.DB.prepare("UPDATE tasks SET started_at = '2000-01-01T00:00:00.000Z' WHERE state = 'working'").run();
      await c.get("/api/state");
    }
    const { data } = await c.get("/api/rooms/studio");
    // The seeded "images" task auto-finished and handed off to the Inspector.
    expect(data.tasks.some((t: any) => t.kind === "images" && t.state === "done")).toBe(true);
    expect(data.tasks.some((t: any) => t.kind === "inspect")).toBe(true);
    // The seeded queued "price" task was claimed by the Pricer and now waits for you.
    const listing = (await c.get("/api/rooms/listing")).data;
    const price = listing.tasks.find((t: any) => t.kind === "price");
    expect(price.state).toBe("needs_approval");
    expect(price.output.pricePence).toBeGreaterThan(0);
    // Approving it sends a parcel to the Compliance Office.
    expect((await c.post(`/api/tasks/${price.id}/approve`, {})).status).toBe(200);
    const state = (await c.get("/api/state?h=0")).data;
    expect(state.handoffs.some((h: any) => h.from === "listing" && h.to === "compliance")).toBe(true);
  });

  it("refuses to approve a failing compliance check without an override note", async () => {
    const c = await setUpOwner();
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO products (id,title,niche,stage,seed,data,demo,created_at,updated_at) VALUES ('p1','Test','Test','compliance',4,'{}',1,?,?)`,
    ).bind(now, now).run();
    await env.DB.prepare(
      `INSERT INTO tasks (id,product_id,room,agent,kind,title,state,needs_approval,input,output,demo,created_at,updated_at)
       VALUES ('t1','p1','compliance','warden','compliance_check','Check','needs_approval',1,'{}','{"pass":false,"checks":[]}',1,?,?)`,
    ).bind(now, now).run();
    const refused = await c.post("/api/tasks/t1/approve", {});
    expect(refused.status).toBe(400);
    expect(refused.data.error).toMatch(/hard check/);
    const back = await c.post("/api/tasks/t1/reject", { note: "fix the brand name" });
    expect(back.status).toBe(200);
    const listing = await c.get("/api/rooms/listing");
    expect(listing.data.tasks.some((t: any) => t.kind === "copy" && t.productId === "p1")).toBe(true);
  });

  it("blocks agents at the spend cap", async () => {
    const c = await setUpOwner();
    await c.put("/api/settings", { dailyCapPence: 0, monthlyCapPence: 0 });
    // Seeded "price" task is queued in the Listing Office; Pricer estimates 0p so add a costly one.
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO products (id,title,niche,stage,seed,data,demo,created_at,updated_at) VALUES ('p2','Cap','Cap','research',8,'{}',1,?,?)`,
    ).bind(now, now).run();
    await env.DB.prepare(
      `INSERT INTO tasks (id,product_id,room,agent,kind,title,state,needs_approval,input,demo,created_at,updated_at)
       VALUES ('t2','p2','research','analyst','brief','Brief','queued',0,'{}',1,?,?)`,
    ).bind(now, now).run();
    const s = (await c.get("/api/state")).data;
    expect(s.agents.find((a: any) => a.id === "analyst").status).toBe("blocked");
  });

  it("lets you launch at level 1 (no rooms are locked)", async () => {
    const c = await setUpOwner();
    await c.post("/api/demo/clear", {});
    expect((await c.get("/api/state")).data.game.level).toBe(1);
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO products (id,title,niche,stage,seed,data,demo,created_at,updated_at) VALUES ('pl','Real','Real','launch',5,'{}',0,?,?)`,
    ).bind(now, now).run();
    await env.DB.prepare(
      `INSERT INTO tasks (id,product_id,room,agent,kind,title,state,needs_approval,input,output,demo,created_at,updated_at)
       VALUES ('tl','pl','launch',NULL,'launch_pack','Launch: Real','needs_approval',1,'{}','{}',0,?,?)`,
    ).bind(now, now).run();
    const r = await c.post("/api/tasks/tl/approve", {});
    expect(r.status).toBe(200);
  });

  it("records the briefing and room visits", async () => {
    const c = await setUpOwner();
    const b = await c.get("/api/briefing");
    expect(b.data.greeting).toMatch(/briefing/);
    await c.post("/api/briefing/seen", {});
    expect((await c.get("/api/state")).data.briefingDue).toBe(false);
    expect((await c.post("/api/events", { type: "room_visit" })).status).toBe(200);
    expect((await c.post("/api/events", { type: "task_approved" })).status).toBe(400);
  });
});
