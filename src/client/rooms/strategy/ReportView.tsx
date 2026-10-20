// One of Manager's reports: headline, what went well / didn't, and next steps to tick off.
import { useState } from "react";
import { Link } from "react-router";
import { plain } from "../../lib/format";
import { ROOM_LABEL } from "../../lib/rooms";
import { Icon } from "../../components/Icon";
import type { StrategyReport } from "./types";

const doneKey = (id: string) => `bs:strategy-done:${id}`;

function loadDone(id: string): number[] {
  try {
    return JSON.parse(localStorage.getItem(doneKey(id)) ?? "[]") as number[];
  } catch {
    return [];
  }
}

export function weekLabel(r: StrategyReport) {
  const d = new Date(r.numbers.weekly.at(-1)?.weekStart ?? r.at);
  return `Week starting ${d.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" })}`;
}

export function ReportView({ report }: { report: StrategyReport }) {
  const [done, setDone] = useState<number[]>(() => loadDone(report.id));
  const toggle = (i: number) => {
    const next = done.includes(i) ? done.filter((x) => x !== i) : [...done, i];
    setDone(next);
    try {
      localStorage.setItem(doneKey(report.id), JSON.stringify(next));
    } catch {
      /* private window: ticks just aren't remembered */
    }
  };
  return (
    <div className="space-y-5">
      <p className="text-lg leading-snug font-semibold text-zinc-900 dark:text-zinc-100">{plain(report.headline)}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <PointList title="What went well" dot="bg-emerald-500" items={report.wentWell} empty="Nothing to note this week." />
        <PointList title="What didn't" dot="bg-rose-500" items={report.didnt} empty="Nothing to note this week." />
      </div>
      <div>
        <div className="label mb-2">Next steps</div>
        <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-white/[0.06] dark:border-white/10">
          {report.nextSteps.map((s, i) => {
            const isDone = done.includes(i);
            return (
              <li key={i} className="flex items-start gap-3 px-3 py-2.5">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={isDone}
                  aria-label={isDone ? "Mark as not done" : "Mark as done"}
                  onClick={() => toggle(i)}
                  className={`mt-0.5 grid h-4.5 w-4.5 shrink-0 place-items-center rounded border transition ${isDone ? "border-emerald-500 bg-emerald-500 text-white" : "border-zinc-300 bg-white hover:border-zinc-400 dark:border-white/20 dark:bg-transparent"}`}
                >
                  {isDone && <Icon name="check" size={12} />}
                </button>
                <span className={`min-w-0 flex-1 text-sm ${isDone ? "text-zinc-400 line-through dark:text-zinc-500" : "text-zinc-700 dark:text-zinc-300"}`}>{plain(s.text)}</span>
                {s.room && s.room !== "strategy" && (
                  <Link to={`/room/${s.room}`} className="btn-soft shrink-0 px-2.5 py-1 text-xs">
                    Go to {ROOM_LABEL[s.room]} <Icon name="arrowRight" size={12} />
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function PointList({ title, dot, items, empty }: { title: string; dot: string; items: string[]; empty: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="label mb-2">{title}</div>
      {items.length ? (
        <ul className="space-y-1.5">
          {items.map((t, i) => (
            <li key={i} className="flex gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <span className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden />
              <span>{plain(t)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{empty}</p>
      )}
    </div>
  );
}
