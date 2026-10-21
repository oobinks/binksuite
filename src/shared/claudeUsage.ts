// Your Claude plan's limits, as Claude Code reports them alongside each reply
// (a "rate_limit_event" in stream-json output): the session window (5 hours)
// and the weekly window. The shape isn't a published contract, so anything we
// can't read is left out rather than guessed.

export interface UsageWindow {
  /** 0–100. */
  usedPercent: number;
  /** When this window resets (ISO), if known. */
  resetsAt: string | null;
}

export interface ClaudeUsage {
  session: UsageWindow | null;
  weekly: UsageWindow | null;
  /** "allowed", "allowed_warning" or "rejected" (a limit was hit). */
  status: string | null;
  /** When the reading was taken (ISO). */
  at: string;
}

/** Where the latest reading is kept (key-value store). */
export const CLAUDE_USAGE_KEY = "claudeUsage";

/** At or above this, BinkSuite stops starting Claude on its own until the window resets. */
export const USAGE_PAUSE_PERCENT = 95;

function window(w: unknown): UsageWindow | null {
  if (!w || typeof w !== "object") return null;
  const { utilization, resetsAt } = w as { utilization?: unknown; resetsAt?: unknown };
  if (typeof utilization !== "number" || !Number.isFinite(utilization)) return null;
  // Reported as a fraction (0.48 = 48%); a reading above 1 is already a percentage.
  const pct = utilization <= 1 ? utilization * 100 : utilization;
  const at = typeof resetsAt === "number" && resetsAt > 1e9 ? new Date((resetsAt < 1e12 ? resetsAt * 1000 : resetsAt)).toISOString() : null;
  return { usedPercent: Math.max(0, Math.min(100, Math.round(pct * 10) / 10)), resetsAt: at };
}

/** Read the plan usage from one line of `claude -p --output-format stream-json --verbose`. */
export function usageFromStreamLine(line: string, now = new Date()): ClaudeUsage | null {
  let ev: { type?: string; rate_limit_info?: Record<string, unknown> };
  try {
    ev = JSON.parse(line);
  } catch {
    return null;
  }
  if (ev?.type !== "rate_limit_event" || !ev.rate_limit_info) return null;
  const info = ev.rate_limit_info;
  const windows = (info.unifiedWindows ?? {}) as Record<string, unknown>;
  let session = window(windows.five_hour);
  let weekly = window(windows.seven_day);
  // Older shape: one window per event, named by rateLimitType.
  if (!session && info.rateLimitType === "five_hour") session = window(info);
  if (!weekly && info.rateLimitType === "seven_day") weekly = window(info);
  if (!session && !weekly) return null;
  return { session, weekly, status: typeof info.status === "string" ? info.status : null, at: now.toISOString() };
}

/** The window that stops Claude starting by itself right now, if any. */
export function usagePause(u: ClaudeUsage | null, now = new Date()): { window: "session" | "weekly"; resetsAt: string | null } | null {
  if (!u) return null;
  for (const name of ["weekly", "session"] as const) {
    const w = u[name];
    if (!w || w.usedPercent < USAGE_PAUSE_PERCENT) continue;
    // Once the reset time has passed, the reading is out of date: don't hold Claude back.
    if (w.resetsAt && new Date(w.resetsAt).getTime() <= now.getTime()) continue;
    return { window: name, resetsAt: w.resetsAt };
  }
  return null;
}
