// Cached game totals (XP, coins, quest count). The HQ polls every few seconds, and
// re-summing the ledger and event log each time would burn through D1's free
// 5M rows-read/day. Instead we cache the totals in one kv row and drop the cache
// whenever something that affects them is written.
import type { DB } from "../db";
import { kvGet, kvSet, GAME_CACHE_KEY } from "../lib/store";
import { getQuests, netProfitPence, totalXp } from "./game";

/** Belt and braces: even without an invalidation, totals refresh at least this often. */
const MAX_AGE_MS = 60_000;

export interface GameStats {
  /** Cache key parts: invalid on a new UTC day (daily quests reset) or demo toggle. */
  day: string;
  demoMode: boolean;
  at: number;
  xp: number;
  coinsPence: number;
  monthProfitPence: number;
  questsReady: number;
}

export async function getStats(db: DB, demoMode: boolean, now = new Date()): Promise<GameStats> {
  const day = now.toISOString().slice(0, 10);
  const cached = await kvGet<GameStats>(db, GAME_CACHE_KEY);
  if (cached && cached.day === day && cached.demoMode === demoMode && now.getTime() - cached.at < MAX_AGE_MS) return cached;
  const [xp, coinsPence, monthProfitPence, quests] = await Promise.all([
    totalXp(db, demoMode),
    netProfitPence(db, demoMode),
    netProfitPence(db, demoMode, day.slice(0, 7)),
    getQuests(db, demoMode, now),
  ]);
  const stats: GameStats = {
    day,
    demoMode,
    at: now.getTime(),
    xp,
    coinsPence,
    monthProfitPence,
    questsReady: quests.filter((q) => q.visible && q.complete && !q.claimed).length,
  };
  await kvSet(db, GAME_CACHE_KEY, stats);
  return stats;
}
