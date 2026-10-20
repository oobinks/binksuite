import { Link } from "react-router";
import { AGENT_BY_ID, type AgentId } from "../../shared/registry";
import type { AgentSnapshot } from "../../shared/api";
import { plain } from "../lib/format";
import { Avatar } from "./Avatar";
import { ProgressBar, StatusPill } from "../components/ui";

export function AgentCard({ id, state, compact = false }: { id: AgentId; state?: AgentSnapshot; compact?: boolean }) {
  const agent = AGENT_BY_ID[id];
  const status = state?.status ?? "idle";
  return (
    <Link to={`/agent/${id}`} className="card flex items-start gap-3 p-4 transition hover:border-zinc-300 dark:hover:border-white/15">
      <Avatar agent={agent} status={status} size={compact ? 32 : 38} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">{agent.name}</span>
          <StatusPill status={status} />
        </div>
        <div className="text-xs text-zinc-500 dark:text-zinc-400">{agent.role}</div>
        {!compact && (
          <>
            <div className="mt-2 line-clamp-2 text-xs text-zinc-600 dark:text-zinc-300">{plain(state?.bubble ?? agent.idleLines[0])}</div>
            {status === "working" && <ProgressBar value={state?.progress ?? 0} className="mt-2" label={`${agent.name} progress`} />}
            {state?.taskTitle && <div className="mt-1.5 truncate text-xs text-zinc-500 dark:text-zinc-400">{plain(state.taskTitle)}</div>}
          </>
        )}
      </div>
    </Link>
  );
}
