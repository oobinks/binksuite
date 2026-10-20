// A week of posts across Pinterest, Instagram and TikTok. Tick each one off once posted.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { plain, timeAgo } from "../../lib/format";
import { useUi } from "../../lib/store";
import { ErrorNote, Section, Spinner } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { CopyButton } from "../shared/CopyButton";
import { PENDING_TOAST, type Calendar } from "./types";

const CHANNEL_DOT: Record<string, string> = { Pinterest: "bg-rose-500", Instagram: "bg-violet-500", TikTok: "bg-zinc-900 dark:bg-zinc-100" };

const dayLabel = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const today = () => new Date().toISOString().slice(0, 10);

export function ContentCalendar({ calendar }: { calendar: Calendar | null }) {
  const qc = useQueryClient();
  const toast = useUi((s) => s.toast);
  const plan = useMutation({
    mutationFn: (replan: boolean) => api.post<{ pending?: boolean }>("/marketing/calendar", { replan }),
    onSuccess: (r) => {
      toast(r.pending ? PENDING_TOAST : { icon: "", title: "Next week is planned" });
      qc.invalidateQueries({ queryKey: ["marketing"] });
    },
  });
  const tick = useMutation({
    mutationFn: (v: { date: string; done: boolean }) => api.post("/marketing/calendar/done", v),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["marketing"] }),
  });
  const waiting = calendar?.pendingRev != null;
  const days = calendar?.days ?? [];
  const done = days.filter((d) => d.done).length;
  const now = today();

  return (
    <Section
      title="Content calendar"
      right={
        days.length > 0 ? (
          <button className="btn-soft px-2.5 py-1 text-xs" onClick={() => plan.mutate(true)} disabled={plan.isPending || waiting}>
            {plan.isPending ? <Spinner /> : <Icon name="refresh" size={13} />} {waiting ? "Waiting for Claude…" : "Re-plan"}
          </button>
        ) : null
      }
    >
      {days.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
          <p className="mb-3 text-sm text-zinc-700 dark:text-zinc-300">
            {waiting ? "On Claude's to-do list. The plan appears here when Claude's session finishes." : "Promoter plans one post a day for next week, across Pinterest, Instagram and TikTok, with a caption ready to copy."}
          </p>
          <button className="btn-primary px-3 py-1.5 text-sm" onClick={() => plan.mutate(false)} disabled={plan.isPending || waiting}>
            {plan.isPending ? <Spinner /> : <Icon name="sparkles" size={14} />} Plan next week
          </button>
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
            <span>
              Week of {dayLabel(calendar!.weekStart)} · <span className="tabular-nums">{done}/{days.length}</span> posted
            </span>
            <span>{calendar!.real ? "Planned by Promoter" : "Simple plan (switch on real AI in Settings for better ideas)"} · {timeAgo(calendar!.at)}</span>
          </div>
          <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-white/[0.06] dark:border-white/10">
            {days.map((d) => (
              <li key={d.date} className={`flex gap-3 px-3 py-3 ${d.done ? "opacity-60" : ""}`}>
                <input
                  type="checkbox"
                  aria-label={`Posted on ${dayLabel(d.date)}`}
                  className="mt-1 h-4 w-4 shrink-0 accent-[#4f46e5]"
                  checked={d.done}
                  disabled={tick.isPending}
                  onChange={(e) => tick.mutate({ date: d.date, done: e.target.checked })}
                />
                <div className="w-24 shrink-0">
                  <div className={`text-sm font-medium tabular-nums ${d.date === now ? "text-accent dark:text-indigo-300" : "text-zinc-900 dark:text-zinc-100"}`}>{dayLabel(d.date)}</div>
                  <div className="mt-1 inline-flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                    <span className={`h-1.5 w-1.5 rounded-full ${CHANNEL_DOT[d.channel] ?? "bg-zinc-400"}`} aria-hidden />
                    {d.channel}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  {d.productTitle && <div className="truncate text-xs font-medium text-zinc-500 dark:text-zinc-400">{d.productTitle}</div>}
                  <p className={`text-sm text-zinc-800 dark:text-zinc-200 ${d.done ? "line-through" : ""}`}>{plain(d.idea)}</p>
                  <p className="mt-1.5 whitespace-pre-line rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs text-zinc-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-300">{plain(d.caption)}</p>
                </div>
                <div className="shrink-0">
                  <CopyButton text={d.caption} label="Copy caption" />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="mt-2 space-y-2">
        <ErrorNote error={plan.error} />
        <ErrorNote error={tick.error} />
      </div>
    </Section>
  );
}
