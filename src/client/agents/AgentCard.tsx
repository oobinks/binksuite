import { Link } from "react-router";
import { AGENT_BY_ID, ROOM_BY_ID, type AgentId } from "../../shared/registry";
import type { AgentSnapshot } from "../../shared/api";
import { Avatar } from "./Avatar";
import { ProgressBar, StatusPill } from "../components/ui";

export function AgentCard({ id, state, compact = false }: { id: AgentId; state?: AgentSnapshot; compact?: boolean }) {
  const agent = AGENT_BY_ID[id];
  const room = ROOM_BY_ID[agent.room];
  const status = state?.status ?? "idle";
  return (
    <Link to={`/agent/${id}`} className="card flex items-center gap-3 p-3 transition hover:-translate-y-0.5">
      <div className="relative">
        <Avatar agent={agent} status={status} size={compact ? 44 : 56} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-black">{agent.name}</span>
          <StatusPill status={status} />
        </div>
        <div className="text-xs font-semibold text-cocoa dark:text-stone-400">{agent.role}</div>
        {!compact && (
          <>
            <div className="mt-1 truncate text-sm italic">“{state?.bubble ?? agent.idleLines[0]}”</div>
            {status === "working" && <ProgressBar value={state?.progress ?? 0} color={room.color} className="mt-1.5" label={`${agent.name} progress`} />}
            {state?.taskTitle && <div className="mt-1 truncate text-xs text-cocoa dark:text-stone-400">📄 {state.taskTitle}</div>}
          </>
        )}
      </div>
    </Link>
  );
}
