// Server-side game bookkeeping: events, XP, level-ups, achievements, quests.
import { and, eq, gte, desc, inArray } from "drizzle-orm";
import type { DB } from "../db";
import { events, xpLog, achievements, notifications, questClaims, ledger } from "../db/schema";
import { nowIso, visible, sum, count, invalidateStats } from "../lib/store";
import {
  ACHIEVEMENTS,
  QUESTS,
  earnedAchievements,
  levelForXp,
  periodKey,
  periodStart,
  questStatuses,
  unlocksAtLevel,
  type GameEventType,
  type QuestStatus,
} from "../../shared/game";

export async function recordEvent(db: DB, type: GameEventType, demo: boolean, amount = 1) {
  await db.insert(events).values({ type, amount, demo, createdAt: nowIso() });
  await invalidateStats(db);
}

export async function totalXp(db: DB, demoMode: boolean): Promise<number> {
  const row = await db.select({ xp: sum(xpLog.amount) }).from(xpLog).where(visible(xpLog.demo, demoMode)).get();
  return row?.xp ?? 0;
}

export async function notify(db: DB, kind: string, title: string, body: string | null, demo: boolean) {
  await db.insert(notifications).values({ kind, title, body, demo, createdAt: nowIso() });
}

/** Award XP and raise a level-up notification if a threshold is crossed. */
export async function awardXp(db: DB, amount: number, reason: string, demo: boolean, demoMode: boolean) {
  const before = levelForXp(await totalXp(db, demoMode));
  await db.insert(xpLog).values({ amount, reason, demo, createdAt: nowIso() });
  await invalidateStats(db);
  const after = levelForXp(await totalXp(db, demoMode));
  for (let lv = before + 1; lv <= after; lv++) {
    const unlocks = unlocksAtLevel(lv);
    await notify(db, "level", `Level ${lv}!`, unlocks.length ? `Unlocked: ${unlocks.join(", ")}` : "Keep going!", demo);
  }
}

export async function netProfitPence(db: DB, demoMode: boolean, from?: string): Promise<number> {
  const conds = [visible(ledger.demo, demoMode), from ? gte(ledger.date, from) : undefined].filter(Boolean);
  const row = await db
    .select({ total: sum(ledger.amountPence) })
    .from(ledger)
    .where(and(...conds))
    .get();
  return row?.total ?? 0;
}

async function countEvents(db: DB, type: GameEventType, demoMode: boolean, from?: string): Promise<number> {
  const row = await db
    .select({ n: sum(events.amount) })
    .from(events)
    .where(and(eq(events.type, type), visible(events.demo, demoMode), from ? gte(events.createdAt, from) : undefined))
    .get();
  return row?.n ?? 0;
}

export async function checkAchievements(db: DB, demo: boolean, demoMode: boolean): Promise<void> {
  const [approvals, launches, sales, xp, profitPence, claimed, have] = await Promise.all([
    countEvents(db, "task_approved", demoMode),
    countEvents(db, "product_launched", demoMode),
    countEvents(db, "sale", demoMode),
    totalXp(db, demoMode),
    netProfitPence(db, demoMode),
    db.select({ n: count() }).from(questClaims).where(visible(questClaims.demo, demoMode)).get(),
    db.select({ id: achievements.id }).from(achievements).where(visible(achievements.demo, demoMode)).all(),
  ]);
  const owned = new Set(have.map((h) => h.id));
  const earned = earnedAchievements({
    approvals,
    launches,
    sales,
    level: levelForXp(xp),
    profitPence,
    questsClaimed: claimed?.n ?? 0,
  });
  for (const id of earned) {
    if (owned.has(id)) continue;
    const def = ACHIEVEMENTS.find((a) => a.id === id)!;
    await db.insert(achievements).values({ id, demo, unlockedAt: nowIso() }).onConflictDoNothing();
    await notify(db, "achievement", `${def.icon} ${def.title}`, def.description, demo);
  }
}

export async function listAchievements(db: DB, demoMode: boolean) {
  const rows = await db.select().from(achievements).where(visible(achievements.demo, demoMode)).all();
  const unlocked = new Map(rows.map((r) => [r.id, r.unlockedAt]));
  return ACHIEVEMENTS.map(({ test: _t, ...a }) => ({ ...a, unlockedAt: unlocked.get(a.id) ?? null }));
}

export async function getQuests(db: DB, demoMode: boolean, now = new Date()): Promise<QuestStatus[]> {
  const values = await Promise.all(
    QUESTS.map(async (q) => {
      const from = q.kind === "campaign" ? undefined : periodStart(q.kind, now);
      return q.metric === "profit"
        ? Math.max(0, await netProfitPence(db, demoMode, from))
        : await countEvents(db, q.metric, demoMode, from);
    }),
  );
  const progress: Record<string, number> = Object.fromEntries(QUESTS.map((q, i) => [q.id, values[i]]));
  const keys = QUESTS.map((q) => periodKey(q.kind, now));
  const claims = await db
    .select()
    .from(questClaims)
    .where(and(inArray(questClaims.periodKey, [...new Set(keys)]), visible(questClaims.demo, demoMode)))
    .all();
  const claimed = new Set(
    claims.filter((c) => QUESTS.find((q) => q.id === c.questId && periodKey(q.kind, now) === c.periodKey)).map((c) => c.questId),
  );
  return questStatuses(progress, claimed);
}

export async function claimQuest(db: DB, questId: string, demoMode: boolean, now = new Date()) {
  const statuses = await getQuests(db, demoMode, now);
  const s = statuses.find((x) => x.quest.id === questId);
  if (!s || !s.visible) throw new Error("Unknown quest");
  if (!s.complete) throw new Error("Quest isn't complete yet");
  if (s.claimed) throw new Error("Already claimed");
  await db.insert(questClaims).values({
    questId,
    periodKey: periodKey(s.quest.kind, now),
    demo: demoMode,
    claimedAt: nowIso(now),
  });
  await recordEvent(db, "quest_claimed", demoMode);
  await awardXp(db, s.quest.xp, `Quest: ${s.quest.title}`, demoMode, demoMode);
  await checkAchievements(db, demoMode, demoMode);
  return s.quest;
}

export async function recentNotifications(db: DB, demoMode: boolean, afterId: number) {
  const rows = await db
    .select()
    .from(notifications)
    .where(and(visible(notifications.demo, demoMode), gte(notifications.id, afterId + 1)))
    .orderBy(desc(notifications.id))
    .limit(10)
    .all();
  return rows.reverse();
}
