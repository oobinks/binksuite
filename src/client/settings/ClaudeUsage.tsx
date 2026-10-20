// Your Claude plan's limits: the session window and the weekly window, as the
// Claude routine last read them. Near a limit, BinkSuite stops starting Claude by itself.
import { useEffect, useState } from "react";
import { useClaude } from "../components/ClaudeBar";
import { ProgressBar, Section } from "../components/ui";
import { timeAgo } from "../lib/format";
import { USAGE_PAUSE_PERCENT, type UsageWindow } from "../../shared/claudeUsage";

const tone = (pct: number) => (pct >= USAGE_PAUSE_PERCENT ? "#e11d48" : pct >= 80 ? "#f59e0b" : "#4f46e5");

function resetText(iso: string | null, now: number) {
  if (!iso) return "Reset time not known";
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return "Has reset since this reading";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.round((ms % 3_600_000) / 60_000);
  const when = new Date(iso).toLocaleString("en-GB", { weekday: h >= 20 ? "short" : undefined, hour: "numeric", minute: "2-digit" });
  return `Resets in ${h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : h ? `${h}h ${m}m` : `${m}m`} (${when})`;
}

function Window({ title, hint, w, now }: { title: string; hint: string; w: UsageWindow | null; now: number }) {
  const stale = !!w?.resetsAt && new Date(w.resetsAt).getTime() <= now;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <div className="text-sm font-medium">{title}</div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400">{hint}</div>
        </div>
        <div className="text-right text-xl font-semibold tabular-nums" style={{ color: w && !stale ? tone(w.usedPercent) : undefined }}>
          {w ? (stale ? "Reset" : `${Math.round(w.usedPercent)}%`) : "—"}
        </div>
      </div>
      <ProgressBar value={w && !stale ? w.usedPercent / 100 : 0} color={w ? tone(w.usedPercent) : undefined} className="mt-2" label={`${title} used`} />
      <div className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">{w ? resetText(w.resetsAt, now) : "Not read yet"}</div>
    </div>
  );
}

export function ClaudeUsageCard() {
  const { data } = useClaude(true);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const u = data?.usage ?? null;
  const high = !!u && [u.session, u.weekly].some((w) => w && w.usedPercent >= USAGE_PAUSE_PERCENT && (!w.resetsAt || new Date(w.resetsAt).getTime() > now));
  return (
    <Section title="Claude plan usage" right={u && <span className="chip">Checked {timeAgo(u.at)}</span>}>
      <div className="space-y-5 text-sm">
        <p className="text-zinc-600 dark:text-zinc-400">How much of your Claude plan is used. If a limit runs out, Claude can't do BinkSuite's jobs until it resets.</p>
        <Window title="Current session" hint="Resets every few hours" w={u?.session ?? null} now={now} />
        <Window title="This week" hint="All Claude use on your plan, including chats" w={u?.weekly ?? null} now={now} />
        {high && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
            Nearly at a limit, so BinkSuite won't start Claude by itself until it resets. You can still press Start Claude.
          </p>
        )}
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {u
            ? "Updated each time Claude starts and finishes BinkSuite's jobs, so it can be a little behind if you've been chatting with Claude since."
            : "The first reading arrives the next time Claude works on BinkSuite's jobs."}
        </p>
      </div>
    </Section>
  );
}
