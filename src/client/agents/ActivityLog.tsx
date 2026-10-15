import { AGENT_BY_ID } from "../../shared/registry";
import type { ActivityView } from "../../shared/api";
import { timeAgo } from "../lib/format";
import { Avatar } from "./Avatar";

const KIND_ICON: Record<string, string> = { start: "▶️", finish: "✅", handoff: "📦", approved: "👍", rejected: "↩️", error: "⚠️", blocked: "⛔", new: "💡" };

export function ActivityLog({ items, empty = "Nothing yet." }: { items: ActivityView[]; empty?: string }) {
  if (!items.length) return <p className="text-sm text-cocoa dark:text-stone-400">{empty}</p>;
  return (
    <ol className="space-y-2">
      {items.map((a) => (
        <li key={a.id} className="flex items-start gap-2 text-sm">
          {a.agent ? <Avatar agent={AGENT_BY_ID[a.agent]} size={24} showProp={false} status="idle" /> : <span className="w-6 text-center">🧑‍💼</span>}
          <span className="min-w-0 flex-1">
            <span aria-hidden>{KIND_ICON[a.kind] ?? "•"}</span> {a.message}
          </span>
          <time className="shrink-0 text-xs text-cocoa/70 dark:text-stone-500" dateTime={a.createdAt}>
            {timeAgo(a.createdAt)}
          </time>
        </li>
      ))}
    </ol>
  );
}
