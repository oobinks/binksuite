// ✨ Claude Code engine: jobs wait on Claude's to-do list, a session answers them
// through /api/agent, bad answers are sent back with a reason, and the pipeline carries on.
import { describe, expect, it } from "vitest";
import { SELF, env } from "cloudflare:test";
import { getDb } from "../../src/worker/db";
import { getSettings, kvSet } from "../../src/worker/lib/store";
import { suggestIdea, tick, approveTask } from "../../src/worker/engine/queue";
import { claudeCodeAi, CLAUDE_WAITING } from "../../src/worker/providers/claudeCode";
import { BASE, setUpOwner } from "./helpers";

async function agent(key: string, method: string, path: string, body?: unknown) {
  const res = await SELF.fetch(`${BASE}/api/agent${path}`, {
    method,
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json()) as any };
}

async function setup() {
  const owner = await setUpOwner();
  await owner.put("/api/settings", { demoMode: false, ai: { provider: "claude-code" } });
  const key = (await owner.post("/api/claude/key")).data.key as string;
  const db = getDb(env.DB);
  const settings = await getSettings(db);
  return { owner, key, db, settings, ai: claudeCodeAi(db, null) };
}

const taskOf = async (productId: string, kind: string) =>
  env.DB.prepare("SELECT * FROM tasks WHERE product_id = ? AND kind = ? ORDER BY created_at DESC").bind(productId, kind).first<any>();

const GOOD_REPORT = {
  scores: { demand: 8, competition: 4, aiFit: 9, pricePotential: 7 },
  summary: "Strong and giftable.",
  reasons: ["a", "b", "c"],
  risks: [],
  angles: ["x", "y", "z"],
  keywords: ["frog print"],
  priceLowGBP: 3,
  priceHighGBP: 6,
  seasonality: "All year",
};

const SVG = `<svg viewBox="0 0 1000 1250"><rect width="1000" height="1250" fill="#f6efe4"/><circle cx="500" cy="600" r="300" fill="#6d8b74"/></svg>`;

describe("Claude Code engine", () => {
  it("puts work on Claude's list, takes answers back, and sends broken ones back with a reason", async () => {
    const { owner, key, db, settings, ai } = await setup();
    expect((await agent("bsk_wrong", "GET", "/jobs")).status).toBe(401);

    const p = await suggestIdea(db, settings, "Frog reading a book wall art", undefined, true, { format: "art" });
    await tick(db, settings, { interactive: false, ai, files: env.FILES });
    await tick(db, settings, { interactive: false, ai, files: env.FILES });
    const research = await taskOf(p.id, "niche_score");
    expect(research.state).toBe("blocked");
    expect(research.error).toBe(CLAUDE_WAITING);

    // Waiting tasks aren't re-run every tick (no churn while Claude hasn't answered).
    const before = research.updated_at;
    await tick(db, settings, { interactive: false, ai, files: env.FILES });
    expect((await taskOf(p.id, "niche_score")).updated_at).toBe(before);

    const status = (await owner.get("/api/claude")).data;
    expect(status).toMatchObject({ provider: "claude-code", connected: false, keySet: true, waiting: 1 });

    const jobs = (await agent(key, "GET", "/jobs")).data.jobs;
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ kind: "json", product: { id: p.id, format: "art" } });
    expect(jobs[0].jsonSchema.required).toContain("scores");
    expect((await agent(key, "POST", `/jobs/${encodeURIComponent(jobs[0].id)}/claim`, {})).data.ok).toBe(true);

    // Not JSON → refused straight away.
    expect((await agent(key, "POST", `/jobs/${encodeURIComponent(jobs[0].id)}/answer`, { answer: "sure thing!" })).status).toBe(400);
    // JSON that doesn't match → sent back with the reason, and the job waits again.
    const wrong = await agent(key, "POST", `/jobs/${encodeURIComponent(jobs[0].id)}/answer`, { answer: JSON.stringify({ summary: "hi" }) });
    expect(wrong.status).toBe(422);
    expect(wrong.data.problem).toMatch(/didn't match the schema/);
    expect((await agent(key, "GET", "/jobs")).data.jobs[0].previousProblem).toMatch(/scores/);
    // A good answer (in a code fence, even) moves the product on.
    const ok = await agent(key, "POST", `/jobs/${encodeURIComponent(jobs[0].id)}/answer`, { answer: "```json\n" + JSON.stringify(GOOD_REPORT) + "\n```" });
    expect(ok.status).toBe(200);
    expect(ok.data.task.state).toBe("needs_approval");
    const report = JSON.parse((await taskOf(p.id, "niche_score")).output);
    expect(report.verdict).toBe("go");

    // Brief → vector art: the Analyst is asked for artwork briefs, the Designer for SVGs.
    await approveTask(db, research.id, settings);
    await tick(db, settings, { interactive: false, ai, files: env.FILES });
    await tick(db, settings, { interactive: false, ai, files: env.FILES });
    const briefJob = (await agent(key, "GET", "/jobs")).data.jobs[0];
    expect(briefJob.prompt).toMatch(/vector art \(SVG\)/);
    const brief = {
      productTitle: "Bookish Frog Prints",
      audience: "Readers",
      style: "mid-century",
      palette: ["#6d8b74", "#f6efe4"],
      imagePrompts: ["A frog in an armchair reading", "Stack of books with a frog"],
      boosters: [],
    };
    expect((await agent(key, "POST", `/jobs/${encodeURIComponent(briefJob.id)}/answer`, { answer: JSON.stringify(brief) })).status).toBe(200);
    await approveTask(db, (await taskOf(p.id, "brief")).id, settings, undefined, { chosen: [] });
    for (let i = 0; i < 3; i++) await tick(db, settings, { interactive: false, ai, files: env.FILES });
    const all = (await agent(key, "GET", "/jobs")).data.jobs;
    const art = all.find((j: any) => j.kind === "svg");
    expect(art.prompt).toMatch(/Artwork 1 of 4/);
    expect(art.prompt).toMatch(/frog in an armchair/);
    // An SVG that draws nothing is refused; a good one is cleaned, stored, and the next piece is asked for.
    expect((await agent(key, "POST", `/jobs/${encodeURIComponent(art.id)}/answer`, { answer: "<svg viewBox='0 0 10 10'></svg>" })).status).toBe(400);
    const done = await agent(key, "POST", `/jobs/${encodeURIComponent(art.id)}/answer`, { answer: SVG.replace("<rect", `<script>alert(1)</script><rect onclick="x()"`) });
    expect(done.status).toBe(200);
    const images = JSON.parse((await taskOf(p.id, "images")).output).images;
    expect(images[0].key).toMatch(/\.svg$/);
    const stored = await (await env.FILES.get(images[0].key))!.text();
    expect(stored).not.toMatch(/script|onclick/);
    expect(stored).toMatch(/width="2400" height="3000"/);
    expect((await agent(key, "GET", "/jobs")).data.jobs.map((j: any) => j.prompt).join()).toMatch(/Artwork 2 of 4/);

    // Session finished → a note for the owner.
    expect((await agent(key, "POST", "/done", { answered: 4, note: "Made research and art" })).status).toBe(200);
    expect((await owner.get("/api/claude")).data.run.answered).toBe(4);
  });

  it("checks the routine link and needs one before starting a session", async () => {
    const { owner } = await setup();
    await suggestIdea(getDb(env.DB), await getSettings(getDb(env.DB)), "Owl nursery art", undefined, true);
    await tick(getDb(env.DB), await getSettings(getDb(env.DB)), { interactive: false, ai: claudeCodeAi(getDb(env.DB), null), files: env.FILES });
    await tick(getDb(env.DB), await getSettings(getDb(env.DB)), { interactive: false, ai: claudeCodeAi(getDb(env.DB), null), files: env.FILES });
    expect((await owner.post("/api/claude/start", {})).status).toBe(400);
    expect((await owner.put("/api/claude/routine", { url: "https://evil.example/fire", token: "sk-ant-oat01-aaaaaaaaaaaaaaaaaaaa" })).status).toBe(400);
    expect((await owner.put("/api/claude/routine", { url: "https://api.anthropic.com/v1/claude_code/routines/trig_abc123/fire", token: "nope-not-a-token-0000000" })).status).toBe(400);
    const saved = await owner.put("/api/claude/routine", { url: "https://api.anthropic.com/v1/claude_code/routines/trig_abc123/fire", token: "sk-ant-oat01-aaaaaaaaaaaaaaaaaaaa" });
    expect(saved.status).toBe(200);
    expect((await owner.get("/api/claude")).data).toMatchObject({ connected: true, routine: { last4: "aaaa" } });
    // The token is stored encrypted, never in plain text.
    const row = await env.DB.prepare("SELECT ciphertext FROM vault WHERE provider = 'claude-routine'").first<any>();
    expect(row.ciphertext).not.toMatch(/sk-ant/);
  });

  it("doesn't call a session 'working' once it clearly never got going", async () => {
    const { owner } = await setup();
    const db = getDb(env.DB);
    const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
    await kvSet(db, "claudeRun", { at: ago(1) });
    expect((await owner.get("/api/claude")).data.running).toBe(true); // just started
    await kvSet(db, "claudeRun", { at: ago(5) });
    expect((await owner.get("/api/claude")).data.running).toBe(false); // 5 min and no job picked up: it failed to connect
    await kvSet(db, "claudeRun", { at: ago(1), finishedAt: ago(0) });
    expect((await owner.get("/api/claude")).data.running).toBe(false); // reported done
  });

  it("stores the plan limits a session reports, and pauses automatic starts near a limit", async () => {
    const { owner, key } = await setup();
    const soon = Math.floor(Date.now() / 1000) + 3600;
    const line = JSON.stringify({ type: "rate_limit_event", rate_limit_info: { status: "allowed_warning", unifiedWindows: { five_hour: { utilization: 0.97, resetsAt: soon }, seven_day: { utilization: 0.5, resetsAt: soon + 86400 } } } });
    const r = await agent(key, "POST", "/usage", { events: [line] });
    expect(r.status).toBe(200);
    expect(r.data.usage.session.usedPercent).toBe(97);
    const status = (await owner.get("/api/claude")).data;
    expect(status.usage.weekly.usedPercent).toBe(50);
    expect((await agent(key, "POST", "/usage", { events: ['{"type":"assistant"}'] })).data).toEqual({ ok: false, usage: null });
    // With a job waiting, an automatic start holds off; the reason says why.
    await suggestIdea(getDb(env.DB), await getSettings(getDb(env.DB)), "Frog teacher posters", undefined, true);
    for (let i = 0; i < 2; i++) await tick(getDb(env.DB), await getSettings(getDb(env.DB)), { interactive: false, ai: claudeCodeAi(getDb(env.DB), null), files: env.FILES });
    expect((await owner.get("/api/claude")).data.waiting).toBeGreaterThan(0);
    const auto = await owner.post("/api/claude/start", { auto: true });
    expect(auto.data.started).toBe(false);
    expect(auto.data.reason).toMatch(/session limit is nearly used up/);
  });

  it("shows an agent whose job is with Claude as 'With Claude', not blocked", async () => {
    const { owner, db, settings, ai } = await setup();
    await suggestIdea(db, settings, "Frog teacher posters", undefined, true);
    for (let i = 0; i < 2; i++) await tick(db, settings, { interactive: false, ai, files: env.FILES });
    const snap = (await owner.get("/api/state")).data;
    expect(snap.agents.find((a: any) => a.id === "scout").status).toBe("claude");
    const research = snap.rooms.find((r: any) => r.id === "research");
    expect(research.blocked).toBe(0);
    expect(research.working).toBeGreaterThan(0);
  });
});
