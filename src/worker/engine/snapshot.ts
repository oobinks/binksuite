// Builds the one big "state of the HQ" payload the map polls every few seconds.
import { and, desc, eq, gt, gte, inArray, lt, sql } from "drizzle-orm";
import type { DB } from "../db";
import { handoffs, products, tasks, ledger, events, activity } from "../db/schema";
import { AGENTS, ROOMS, type AgentId, type RoomId } from "../../shared/registry";
import { levelProgress } from "../../shared/game";
import { hashString } from "../../shared/rng";
import type { AgentStatus } from "../../shared/tasks";
import type { AgentSnapshot, Briefing, RoomSnapshot, Snapshot } from "../../shared/api";
import type { Settings } from "../../shared/settings";
import { kvGet, nowIso, sum, visible } from "../lib/store";
import { getQuests, netProfitPence, recentNotifications } from "./game";
import { getStats } from "./stats";

const JUST_FINISHED_MS = 45_000;

export async function buildSnapshot(
  db: DB,
  settings: Settings,
  opts: { afterNotification: number; afterHandoff: number; secrets: Snapshot["secrets"]; aiReady: boolean },
): Promise<Snapshot> {
  const demoMode = settings.demoMode;
  const now = new Date();
  const recentCutoff = new Date(now.getTime() - JUST_FINISHED_MS).toISOString();

  const [stats, live, recent, hand, notes, lastBriefing] = await Promise.all([
    getStats(db, demoMode, now),
    db
      .select()
      .from(tasks)
      .where(and(inArray(tasks.state, ["queued", "working", "needs_approval", "blocked"]), visible(tasks.demo, demoMode)))
      .all(),
    db
      .select({ agent: tasks.agent })
      .from(tasks)
      .where(and(eq(tasks.state, "done"), gte(tasks.finishedAt, recentCutoff), visible(tasks.demo, demoMode)))
      .all(),
    db
      .select({ id: handoffs.id, from: handoffs.fromRoom, to: handoffs.toRoom, createdAt: handoffs.createdAt, productTitle: products.title })
      .from(handoffs)
      .leftJoin(products, eq(products.id, handoffs.productId))
      .where(and(gt(handoffs.id, opts.afterHandoff), visible(handoffs.demo, demoMode)))
      .orderBy(desc(handoffs.id))
      .limit(10)
      .all(),
    recentNotifications(db, demoMode, opts.afterNotification),
    kvGet<string>(db, "lastBriefing"),
  ]);

  const progress = levelProgress(stats.xp);
  // Progress isn't stored on every tick — work it out from when the task started.
  for (const t of live) {
    if (t.state === "working" && t.startedAt) t.progress = Math.min(0.99, (now.getTime() - new Date(t.startedAt).getTime()) / Math.max(1, t.durationMs));
  }

  const rooms: RoomSnapshot[] = ROOMS.map((r) => {
    const mine = live.filter((t) => t.room === r.id);
    return {
      id: r.id,
      queued: mine.filter((t) => t.state === "queued").length,
      working: mine.filter((t) => t.state === "working").length,
      needsYou: mine.filter((t) => t.state === "needs_approval").length,
      blocked: mine.filter((t) => t.state === "blocked").length,
    };
  });

  const justDone = new Set(recent.map((r) => r.agent));
  const agents: AgentSnapshot[] = AGENTS.map((a) => {
    const mine = live.filter((t) => t.agent === a.id);
    const needs = mine.find((t) => t.state === "needs_approval");
    const working = mine.find((t) => t.state === "working");
    const blocked = mine.find((t) => t.state === "blocked");
    const enabled = settings.agentsEnabled[a.id] !== false;
    let status: AgentStatus = "idle";
    let bubble = a.idleLines[Math.floor(now.getTime() / 20_000 + hashString(a.id)) % a.idleLines.length];
    let taskTitle: string | null = null;
    let prog = 0;
    if (!enabled) {
      status = "off";
      bubble = "Off duty 🌙";
    } else if (needs) {
      status = "needs_you";
      bubble = "Ready for you! ❗";
      taskTitle = needs.title;
      prog = 1;
    } else if (working) {
      status = "working";
      bubble = a.workLines[Math.floor(working.progress * a.workLines.length * 0.999)];
      taskTitle = working.title;
      prog = working.progress;
    } else if (blocked) {
      status = "blocked";
      bubble = blocked.error ?? "Blocked";
      taskTitle = blocked.title;
    } else if (justDone.has(a.id)) {
      status = "done";
      bubble = "Done! ✨";
    }
    return { id: a.id as AgentId, status, progress: prog, bubble, taskTitle, enabled };
  });

  return {
    now: nowIso(now),
    settings,
    game: {
      ...progress,
      coinsPence: stats.coinsPence,
      monthProfitPence: stats.monthProfitPence,
      questsReady: stats.questsReady,
    },
    rooms,
    agents,
    handoffs: hand.reverse().map((h) => ({ ...h, from: h.from as RoomId, to: h.to as RoomId, productTitle: h.productTitle ?? "Parcel" })),
    notifications: notes.map((n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, createdAt: n.createdAt })),
    approvalsWaiting: live.filter((t) => t.state === "needs_approval").length,
    briefingDue: lastBriefing !== now.toISOString().slice(0, 10),
    secrets: opts.secrets,
    aiReady: opts.aiReady,
  };
}

export async function buildBriefing(db: DB, settings: Settings): Promise<Briefing> {
  const demoMode = settings.demoMode;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
  const [ySales, yNet, monthProfit, waiting, quests, recentActs] = await Promise.all([
    db
      .select({ n: sum(events.amount) })
      .from(events)
      .where(and(eq(events.type, "sale"), gte(events.createdAt, yesterday), lt(events.createdAt, today), visible(events.demo, demoMode)))
      .get(),
    db
      .select({ s: sum(ledger.amountPence) })
      .from(ledger)
      .where(and(gte(ledger.date, yesterday), lt(ledger.date, today), visible(ledger.demo, demoMode)))
      .get(),
    netProfitPence(db, demoMode, now.toISOString().slice(0, 7)),
    db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(tasks)
      .where(and(eq(tasks.state, "needs_approval"), visible(tasks.demo, demoMode)))
      .get(),
    getQuests(db, demoMode, now),
    db
      .select()
      .from(activity)
      .where(and(inArray(activity.kind, ["finish", "handoff"]), visible(activity.demo, demoMode)))
      .orderBy(desc(activity.id))
      .limit(3)
      .all(),
  ]);
  const hour = now.getUTCHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const daily = quests.filter((q) => q.quest.kind === "daily" && !q.claimed);
  return {
    date: today,
    greeting: `${greeting}! Here's your ${settings.shopName} briefing.`,
    yesterday: { sales: ySales?.n ?? 0, netPence: yNet?.s ?? 0 },
    monthProfitPence: monthProfit,
    monthlyTargetPence: settings.monthlyTargetPence,
    approvalsWaiting: waiting?.n ?? 0,
    highlights: recentActs.map((a) => a.message),
    quests: daily.map((q) => ({ icon: q.quest.icon, title: q.quest.title, progress: q.progress, target: q.quest.target })),
  };
}

