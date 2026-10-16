// XP, levels, unlocks, quests and achievements. Pure functions, unit-tested.


/** Total XP needed to *reach* each level. Index 0 = Lv1. Tweakable. */
export const LEVEL_THRESHOLDS = [0, 100, 250, 500, 900, 1400, 2000];
const STEP_AFTER_LADDER = 700;

export function levelForXp(xp: number): number {
  let level = 1;
  for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) {
    if (xp >= LEVEL_THRESHOLDS[i]) level = i + 1;
  }
  if (level === LEVEL_THRESHOLDS.length) {
    const last = LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
    level += Math.floor((xp - last) / STEP_AFTER_LADDER);
  }
  return level;
}

export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  if (level <= LEVEL_THRESHOLDS.length) return LEVEL_THRESHOLDS[level - 1];
  return LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1] + (level - LEVEL_THRESHOLDS.length) * STEP_AFTER_LADDER;
}

export interface LevelProgress {
  level: number;
  xp: number;
  currentLevelXp: number;
  nextLevelXp: number;
  /** 0..1 progress through the current level */
  progress: number;
}

export function levelProgress(xp: number): LevelProgress {
  const level = levelForXp(xp);
  const cur = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { level, xp, currentLevelXp: cur, nextLevelXp: next, progress: (xp - cur) / (next - cur) };
}

// Every room is always open. Levels are just for fun: each one earns a new shop title.
export const LEVEL_TITLES = [
  "🧺 Market Stall",
  "🏪 Corner Shop",
  "🪟 Cosy Boutique",
  "🏬 High Street Favourite",
  "⭐ Shining Star Shop",
  "🏰 Printable Empire",
  "👑 Printables Tycoon",
];

export function levelTitle(level: number): string {
  if (level <= LEVEL_TITLES.length) return LEVEL_TITLES[Math.max(1, level) - 1];
  return `${LEVEL_TITLES[LEVEL_TITLES.length - 1]} ${"★".repeat(Math.min(5, level - LEVEL_TITLES.length))}`;
}

export const MAX_LADDER_LEVEL = LEVEL_TITLES.length;

/** XP rewards for engine/game events. */
export const XP = {
  approveTask: 15,
  launchProduct: 50,
  sale: 20,
  recordRealSale: 25,
} as const;

// ───────────────────────── Quests ─────────────────────────

export type QuestKind = "campaign" | "daily" | "weekly";

/** Event types the game counts. Stored in the `events` table. */
export type GameEventType =
  | "login"
  | "room_visit"
  | "task_approved"
  | "fee_calc"
  | "product_launched"
  | "sale"
  | "briefing_seen"
  | "ledger_entry"
  | "settings_saved"
  | "quest_claimed";

export interface QuestDef {
  id: string;
  kind: QuestKind;
  title: string;
  description: string;
  icon: string;
  /** Count events of this type, or sum profit (pence) for "profit". */
  metric: GameEventType | "profit";
  target: number;
  xp: number;
}

export const QUESTS: QuestDef[] = [
  // Starter campaign — shown one at a time, in order.
  { id: "c1-clock-in", kind: "campaign", icon: "🔑", title: "Clock in", description: "Log in to your HQ.", metric: "login", target: 1, xp: 20 },
  { id: "c2-tour", kind: "campaign", icon: "🗺️", title: "Meet the team", description: "Visit 3 rooms.", metric: "room_visit", target: 3, xp: 30 },
  { id: "c3-approve", kind: "campaign", icon: "✅", title: "Sign off", description: "Approve your first task.", metric: "task_approved", target: 1, xp: 40 },
  { id: "c4-numbers", kind: "campaign", icon: "🔢", title: "Know your numbers", description: "Try the fee calculator in the Finance Vault.", metric: "fee_calc", target: 1, xp: 40 },
  { id: "c5-launch", kind: "campaign", icon: "🚀", title: "Lift-off", description: "Launch a product from the Launch Pad.", metric: "product_launched", target: 1, xp: 80 },
  { id: "c6-sale", kind: "campaign", icon: "💰", title: "Ka-ching", description: "Make (or record) a sale.", metric: "sale", target: 1, xp: 60 },
  { id: "c7-pipeline", kind: "campaign", icon: "🏭", title: "Pipeline pro", description: "Approve 10 tasks.", metric: "task_approved", target: 10, xp: 100 },
  // Daily
  { id: "d-briefing", kind: "daily", icon: "☕", title: "Morning brew", description: "Read the daily briefing.", metric: "briefing_seen", target: 1, xp: 10 },
  { id: "d-approve3", kind: "daily", icon: "📝", title: "Busy desk", description: "Approve 3 tasks today.", metric: "task_approved", target: 3, xp: 25 },
  { id: "d-ledger", kind: "daily", icon: "📒", title: "Book-keeper", description: "Add a ledger entry or try the calculator.", metric: "fee_calc", target: 1, xp: 15 },
  // Weekly
  { id: "w-launch2", kind: "weekly", icon: "🚀", title: "Double launch", description: "Launch 2 products this week.", metric: "product_launched", target: 2, xp: 100 },
  { id: "w-approve15", kind: "weekly", icon: "🏅", title: "Head of approvals", description: "Approve 15 tasks this week.", metric: "task_approved", target: 15, xp: 120 },
  { id: "w-profit", kind: "weekly", icon: "💷", title: "Twenty quid", description: "Make £20 net profit this week.", metric: "profit", target: 2000, xp: 150 },
];

/** Start of the quest period containing `now`, as an ISO string (UTC). */
export function periodStart(kind: QuestKind, now: Date): string {
  if (kind === "campaign") return "1970-01-01T00:00:00.000Z";
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (kind === "weekly") {
    const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
    d.setUTCDate(d.getUTCDate() - dow);
  }
  return d.toISOString();
}

/** A stable key for the period, used to record claims (one claim per period). */
export function periodKey(kind: QuestKind, now: Date): string {
  return kind === "campaign" ? "campaign" : periodStart(kind, now).slice(0, 10);
}

export interface QuestStatus {
  quest: QuestDef;
  progress: number;
  complete: boolean;
  claimed: boolean;
  /** Campaign quests are revealed one at a time. */
  visible: boolean;
}

export function questStatuses(
  progressById: Record<string, number>,
  claimedIds: Set<string>,
): QuestStatus[] {
  let campaignFrontierShown = false;
  return QUESTS.map((q) => {
    const progress = Math.min(progressById[q.id] ?? 0, q.target);
    const complete = progress >= q.target;
    const claimed = claimedIds.has(q.id);
    let visible = true;
    if (q.kind === "campaign") {
      if (claimed) visible = true;
      else if (!campaignFrontierShown) {
        visible = true;
        campaignFrontierShown = true;
      } else visible = false;
    }
    return { quest: q, progress, complete, claimed, visible };
  });
}

// ───────────────────────── Achievements ─────────────────────────

export interface AchievementStats {
  approvals: number;
  launches: number;
  sales: number;
  level: number;
  profitPence: number;
  questsClaimed: number;
}

export interface AchievementDef {
  id: string;
  icon: string;
  title: string;
  description: string;
  test: (s: AchievementStats) => boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "first-approval", icon: "🖊️", title: "Signed, sealed", description: "Approve your first task.", test: (s) => s.approvals >= 1 },
  { id: "approver-25", icon: "📮", title: "Rubber stamp", description: "Approve 25 tasks.", test: (s) => s.approvals >= 25 },
  { id: "first-launch", icon: "🚀", title: "We have lift-off", description: "Launch your first product.", test: (s) => s.launches >= 1 },
  { id: "launch-5", icon: "🛰️", title: "Fleet", description: "Launch 5 products.", test: (s) => s.launches >= 5 },
  { id: "first-sale", icon: "💰", title: "First coin", description: "Make your first sale.", test: (s) => s.sales >= 1 },
  { id: "profit-100", icon: "💰", title: "Ton of profit", description: "Reach £100 net profit.", test: (s) => s.profitPence >= 10000 },
  { id: "level-4", icon: "🌟", title: "Rising star", description: "Reach level 4.", test: (s) => s.level >= 4 },
  { id: "level-7", icon: "👑", title: "Tycoon", description: "Reach level 7.", test: (s) => s.level >= 7 },
  { id: "quests-5", icon: "📜", title: "Questing", description: "Claim 5 quest rewards.", test: (s) => s.questsClaimed >= 5 },
];

export function earnedAchievements(stats: AchievementStats): string[] {
  return ACHIEVEMENTS.filter((a) => a.test(stats)).map((a) => a.id);
}

// ───────────────────────── UK tax helper ─────────────────────────

export const TRADING_ALLOWANCE_PENCE = 100_000;

/** UK tax year runs 6 April – 5 April. Returns [startISO, endISO) for the year containing `now`. */
export function ukTaxYear(now: Date): { start: string; end: string; label: string } {
  const y = now.getUTCFullYear();
  const startThis = Date.UTC(y, 3, 6);
  const startYear = now.getTime() >= startThis ? y : y - 1;
  return {
    start: new Date(Date.UTC(startYear, 3, 6)).toISOString(),
    end: new Date(Date.UTC(startYear + 1, 3, 6)).toISOString(),
    label: `${startYear}/${String((startYear + 1) % 100).padStart(2, "0")}`,
  };
}
