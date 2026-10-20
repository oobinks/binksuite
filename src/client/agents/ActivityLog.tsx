import { AGENT_BY_ID } from "../../shared/registry";
import type { ActivityView } from "../../shared/api";
import { plain, timeAgo } from "../lib/format";
import { Avatar } from "./Avatar";
import { Icon } from "../components/Icon";

const KIND_DOT: Record<string, string> = {
  start: "bg-indigo-400",
  finish: "bg-emerald-500",
  handoff: "bg-zinc-400",
  approved: "bg-emerald-500",
  rejected: "bg-amber-500",
  error: "bg-rose-500",
  blocked: "bg-rose-500",
  new: "bg-indigo-400",
};

export function ActivityLog({ items, empty = "Nothing yet." }: { items: ActivityView[]; empty?: string }) {
  if (!items.length) return <p className="text-sm text-zinc-500 dark:text-zinc-400">{empty}</p>;
  return (
    <ol className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
      {items.map((a) => (
        <li key={a.id} className="flex items-start gap-3 py-2.5 text-sm first:pt-0 last:pb-0">
          {a.agent ? (
            <Avatar agent={AGENT_BY_ID[a.agent]} size={24} status="idle" />
          ) : (
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-white/[0.06] dark:text-zinc-400">
              <Icon name="user" size={13} />
            </span>
          )}
          <span className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${KIND_DOT[a.kind] ?? "bg-zinc-300"}`} aria-hidden />
          <span className="min-w-0 flex-1 text-zinc-700 dark:text-zinc-300">{plain(a.message)}</span>
          <time className="shrink-0 pt-px text-xs text-zinc-400 tabular-nums dark:text-zinc-500" dateTime={a.createdAt}>
            {timeAgo(a.createdAt)}
          </time>
        </li>
      ))}
    </ol>
  );
}
