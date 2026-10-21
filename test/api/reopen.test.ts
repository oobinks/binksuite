// Reopening a finished step: the product goes back to that room and the step waits for you again.
import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { getDb } from "../../src/worker/db";
import { getSettings } from "../../src/worker/lib/store";
import { createTask, suggestIdea } from "../../src/worker/engine/queue";
import { setUpOwner } from "./helpers";

describe("reopen a finished step", () => {
  it("takes a launched product back to the Launch step", async () => {
    const c = await setUpOwner();
    const db = getDb(env.DB);
    const p = await suggestIdea(db, await getSettings(db), "Trip budget planner", undefined, true, { format: "excel" });
    const launch = await createTask(db, p, "launch_pack", { demo: false });
    await env.DB.prepare("UPDATE tasks SET state = 'done', output = ? WHERE id = ?").bind(JSON.stringify({ pack: "copy-paste pack" }), launch.id).run();
    await env.DB.prepare("UPDATE tasks SET state = 'done' WHERE product_id = ? AND id != ?").bind(p.id, launch.id).run();
    await env.DB.prepare("UPDATE products SET stage = 'live' WHERE id = ?").bind(p.id).run();

    const r = await c.post(`/api/tasks/${launch.id}/reopen`);
    expect(r.status).toBe(200);
    const fresh = await env.DB.prepare("SELECT * FROM tasks WHERE id = ?").bind(r.data.id).first<any>();
    expect(fresh).toMatchObject({ kind: "launch_pack", state: "needs_approval", room: "launch", product_id: p.id });
    expect(JSON.parse(fresh.output)).toEqual({ pack: "copy-paste pack" });
    expect((await env.DB.prepare("SELECT stage FROM products WHERE id = ?").bind(p.id).first<any>()).stage).toBe("launch");
    expect((await env.DB.prepare("SELECT status FROM approvals WHERE task_id = ?").bind(r.data.id).first<any>()).status).toBe("pending");
    // The old one stays in the history.
    expect((await env.DB.prepare("SELECT state FROM tasks WHERE id = ?").bind(launch.id).first<any>()).state).toBe("done");
    // Only finished steps can be reopened.
    expect((await c.post(`/api/tasks/${r.data.id}/reopen`)).status).toBe(400);
  });

  it("cancels later steps that had started", async () => {
    const c = await setUpOwner();
    const db = getDb(env.DB);
    const p = await suggestIdea(db, await getSettings(db), "Meal planner", undefined, true, { format: "pdf" });
    const first = await env.DB.prepare("SELECT * FROM tasks WHERE product_id = ?").bind(p.id).first<any>();
    await env.DB.prepare("UPDATE tasks SET state = 'done', created_at = '2026-01-01T00:00:00Z' WHERE id = ?").bind(first.id).run();
    const next = await createTask(db, p, "launch_pack", { demo: false });
    const r = await c.post(`/api/tasks/${first.id}/reopen`);
    expect(r.status).toBe(200);
    const later = await env.DB.prepare("SELECT state, error FROM tasks WHERE id = ?").bind(next.id).first<any>();
    expect(later.state).toBe("failed");
    expect(later.error).toMatch(/Cancelled: you reopened/);
  });
});
