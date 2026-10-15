import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { setUpOwner } from "./helpers";

const finishWork = () => env.DB.prepare("UPDATE tasks SET started_at = '2000-01-01T00:00:00.000Z' WHERE state = 'working'").run();

describe("research suggestion box", () => {
  it("researches your idea first and gives a verdict", async () => {
    const c = await setUpOwner();
    // Free Scout up: the seeded niche waits for approval, so Scout is idle.
    const r = await c.post("/api/research/suggestions", { idea: "Cottagecore mushroom wall art", notes: "for plant lovers" });
    expect(r.status).toBe(200);
    let list = (await c.get("/api/research/suggestions")).data.suggestions;
    expect(list[0]).toMatchObject({ idea: "Cottagecore mushroom wall art", verdict: null });

    await c.get("/api/state"); // Scout picks it up
    await finishWork();
    await c.get("/api/state"); // and finishes

    const task = (await c.get("/api/rooms/research")).data.tasks.find((t: any) => t.productId === r.data.productId);
    expect(task.state).toBe("needs_approval");
    expect(task.title).toMatch(/Research your idea/);
    expect(["go", "maybe", "skip"]).toContain(task.output.verdict);
    expect(task.output.reasons.length).toBe(3);
    list = (await c.get("/api/research/suggestions")).data.suggestions;
    expect(list[0].verdict).toBe(task.output.verdict);

    // Approving turns it into a product brief named after your idea.
    expect((await c.post(`/api/tasks/${task.id}/approve`, {})).status).toBe(200);
    await c.get("/api/state");
    await finishWork();
    await c.get("/api/state");
    const brief = (await c.get("/api/rooms/research")).data.tasks.find((t: any) => t.productId === r.data.productId && t.kind === "brief");
    expect(brief.state).toBe("done");
    expect(brief.productTitle).toBe("Cottagecore Mushroom Wall Art Printable");
  });

  it("jumps the queue ahead of demo ideas", async () => {
    const c = await setUpOwner();
    // Clear Scout's desk, queue a demo idea first, then yours.
    const seeded = (await c.get("/api/rooms/research")).data.tasks.find((t: any) => t.state === "needs_approval");
    await c.post(`/api/tasks/${seeded.id}/drop`, {});
    const now = new Date(Date.now() - 60_000).toISOString();
    await env.DB.prepare(
      `INSERT INTO products (id,title,niche,stage,seed,data,demo,created_at,updated_at) VALUES ('pd','Demo','Demo','research',3,'{}',1,?,?)`,
    ).bind(now, now).run();
    await env.DB.prepare(
      `INSERT INTO tasks (id,product_id,room,agent,kind,title,state,needs_approval,input,demo,created_at,updated_at)
       VALUES ('td','pd','research','scout','niche_score','Demo idea','queued',1,'{}',1,?,?)`,
    ).bind(now, now).run();
    const mine = await c.post("/api/research/suggestions", { idea: "Frog teacher posters" });
    await c.get("/api/state");
    const tasks = (await c.get("/api/rooms/research")).data.tasks;
    expect(tasks.find((t: any) => t.productId === mine.data.productId).state).toBe("working");
    expect(tasks.find((t: any) => t.id === "td").state).toBe("queued");
  });

  it("lets you drop an idea", async () => {
    const c = await setUpOwner();
    const r = await c.post("/api/research/suggestions", { idea: "Disney castle prints" });
    const task = (await c.get("/api/rooms/research")).data.tasks.find((t: any) => t.productId === r.data.productId);
    expect((await c.post(`/api/tasks/${task.id}/drop`, { note: "trademark" })).status).toBe(200);
    const list = (await c.get("/api/research/suggestions")).data.suggestions;
    expect(list[0].stage).toBe("dropped");
  });

  it("validates the idea", async () => {
    const c = await setUpOwner();
    expect((await c.post("/api/research/suggestions", { idea: "x" })).status).toBe(400);
  });
});
