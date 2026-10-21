// ✨ Claude Code connection, for the owner: see Claude's to-do list, make the
// connection key a Claude session uses, save the routine link, and start a session.
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { newApp, body, HttpError } from "../app";
import { claudeJobs, vault } from "../db/schema";
import { encryptSecret } from "../lib/crypto";
import { kvGet, kvSet, nowIso, saveSettings } from "../lib/store";
import { vaultSecret } from "../lib/vault";
import { secretsStatus } from "../env";
import { sha256Hex } from "./agent";
import { CLAUDE_USAGE_KEY, usagePause, type ClaudeUsage } from "../../shared/claudeUsage";

const ROUTINE_URL = /^https:\/\/api\.anthropic\.com\/v1\/claude_code\/routines\/[A-Za-z0-9_-]{4,80}\/fire$/;
/** Don't start a second session while one is probably still working. */
const RUN_COOLDOWN_MS = 12 * 60_000;
/** A session that hasn't picked up a job by now didn't get going (e.g. it couldn't connect). */
const RUN_STARTUP_MS = 3 * 60_000;

/** Is a Claude session probably still at work? */
function isRunning(run: ClaudeRun | null | undefined, jobsInHand: number, now = Date.now()) {
  if (!run || run.error) return false;
  const age = now - new Date(run.at).getTime();
  if (age >= RUN_COOLDOWN_MS) return false;
  return jobsInHand > 0 || (!run.finishedAt && age < RUN_STARTUP_MS);
}

interface ClaudeRun {
  at: string;
  sessionUrl?: string | null;
  finishedAt?: string;
  answered?: number;
  error?: string | null;
}

export const claudeRoutes = newApp()
  .get("/claude", async (c) => {
    const db = c.get("db");
    const counts = await db
      .select({ status: claudeJobs.status, n: sql<number>`count(*)`.mapWith(Number) })
      .from(claudeJobs)
      .groupBy(claudeJobs.status)
      .all();
    const n = (s: string) => counts.find((x) => x.status === s)?.n ?? 0;
    const list = await db
      .select({ id: claudeJobs.id, title: claudeJobs.title, kind: claudeJobs.kind, status: claudeJobs.status, error: claudeJobs.error, createdAt: claudeJobs.createdAt })
      .from(claudeJobs)
      .where(inArray(claudeJobs.status, ["waiting", "working"]))
      .orderBy(claudeJobs.createdAt)
      .limit(20)
      .all();
    const run = await kvGet<ClaudeRun>(db, "claudeRun");
    const routine = await db.select({ last4: vault.last4, updatedAt: vault.updatedAt }).from(vault).where(eq(vault.provider, "claude-routine")).get();
    const running = isRunning(run, n("working"));
    return c.json({
      provider: c.get("settings").ai.provider,
      autoStart: c.get("settings").ai.claudeAutoStart,
      connected: !!routine,
      routine: routine ?? null,
      keySet: !!(await kvGet<string>(db, "claudeAgentKey")),
      waiting: n("waiting"),
      working: n("working"),
      jobs: list,
      run: run ?? null,
      running,
      usage: await kvGet<ClaudeUsage>(db, CLAUDE_USAGE_KEY),
    });
  })
  // A new connection key for Claude sessions. Shown once; only its fingerprint is stored.
  .post("/claude/key", async (c) => {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const key = `bsk_${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
    await kvSet(c.get("db"), "claudeAgentKey", await sha256Hex(key));
    return c.json({ key });
  })
  // Save the routine's fire link + token (encrypted), and switch the AI engine to Claude Code.
  .put("/claude/routine", async (c) => {
    const b = await body(c, z.object({ url: z.string().trim(), token: z.string().trim().min(20).max(400) }));
    if (!ROUTINE_URL.test(b.url)) throw new HttpError(400, "That doesn't look like a routine's API link. It should start https://api.anthropic.com/v1/claude_code/routines/ and end /fire.");
    if (!b.token.startsWith("sk-ant-")) throw new HttpError(400, "That doesn't look like a routine token (it starts sk-ant-).");
    if (!secretsStatus(c.env).vaultMasterKey) throw new HttpError(503, "Set the VAULT_MASTER_KEY secret first.");
    const { ciphertext, iv } = await encryptSecret(JSON.stringify({ url: b.url, token: b.token }), c.env.VAULT_MASTER_KEY!);
    const row = { provider: "claude-routine", ciphertext, iv, last4: b.token.slice(-4), updatedAt: nowIso() };
    const db = c.get("db");
    await db.insert(vault).values(row).onConflictDoUpdate({ target: vault.provider, set: row });
    const s = c.get("settings");
    await saveSettings(db, { ...s, ai: { ...s.ai, enabled: true, provider: "claude-code" } });
    return c.json({ ok: true, last4: row.last4 });
  })
  // ✨ Start a Claude Code session to work through the to-do list.
  .post("/claude/start", async (c) => {
    const db = c.get("db");
    const b = await body(c, z.object({ auto: z.boolean().optional() }));
    const waiting = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(claudeJobs).where(eq(claudeJobs.status, "waiting")).get();
    if (!waiting?.n) return c.json({ started: false, reason: "Nothing on Claude's to-do list right now." });
    const run = await kvGet<ClaudeRun>(db, "claudeRun");
    const busy = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(claudeJobs).where(and(eq(claudeJobs.status, "working"))).get();
    if (isRunning(run, busy?.n ?? 0)) return c.json({ started: false, running: true, reason: "A Claude session is already working on it." });
    if (b.auto && run?.error && Date.now() - new Date(run.at).getTime() < RUN_COOLDOWN_MS) return c.json({ started: false, reason: run.error });
    // Near a plan limit: don't start by itself (you can still press Start).
    const pause = b.auto ? usagePause(await kvGet<ClaudeUsage>(db, CLAUDE_USAGE_KEY)) : null;
    if (pause) return c.json({ started: false, reason: `Claude's ${pause.window} limit is nearly used up${pause.resetsAt ? `. It resets ${new Date(pause.resetsAt).toLocaleString("en-GB", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "Europe/London" })}` : ""}.` });
    const secret = await vaultSecret(db, c.env, "claude-routine");
    if (!secret) throw new HttpError(400, "Connect Claude Code first: Settings → Claude Code.");
    const { url, token } = JSON.parse(secret) as { url: string; token: string };
    const res = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "anthropic-beta": "experimental-cc-routine-2026-04-01", "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ text: `BinkSuite has ${waiting.n} job${waiting.n === 1 ? "" : "s"} on Claude's to-do list. Follow .claude/skills/binksuite-maker/SKILL.md.` }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      const error =
        res.status === 401 || res.status === 403
          ? "Claude didn't accept the routine token. Make a new one on the routine's page and save it in Settings → Claude Code."
          : res.status === 429
            ? "You've hit your Claude plan's limit for now. It resets soon; try again later."
            : `Claude couldn't start a session (${res.status}). ${detail.slice(0, 160)}`;
      await kvSet(db, "claudeRun", { at: nowIso(), error } satisfies ClaudeRun);
      throw new HttpError(res.status === 429 ? 429 : 502, error);
    }
    const data = (await res.json().catch(() => ({}))) as { session_url?: string; url?: string };
    const sessionUrl = data.session_url ?? data.url ?? null;
    await kvSet(db, "claudeRun", { at: nowIso(), sessionUrl } satisfies ClaudeRun);
    return c.json({ started: true, sessionUrl, jobs: waiting.n });
  });
