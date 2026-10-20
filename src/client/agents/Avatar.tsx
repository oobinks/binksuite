// Agents are shown as a quiet monogram with a status dot.
import type { AgentDef } from "../../shared/registry";
import type { AgentStatus } from "../../shared/tasks";

interface Props {
  agent: AgentDef;
  status?: AgentStatus;
  size?: number;
  /** Kept for older call sites; monograms have no props to show. */
  showProp?: boolean;
  className?: string;
}

const DOT: Partial<Record<AgentStatus, string>> = {
  working: "bg-accent dark:bg-indigo-400",
  needs_you: "bg-amber-500",
  blocked: "bg-rose-500",
  done: "bg-emerald-500",
};

export function Avatar({ agent, status = "idle", size = 56, className = "" }: Props) {
  const dot = DOT[status];
  const off = status === "off";
  return (
    <span
      className={`relative inline-grid shrink-0 place-items-center rounded-full border border-zinc-200 bg-zinc-100 font-semibold text-zinc-700 dark:border-white/10 dark:bg-white/[0.06] dark:text-zinc-200 ${off ? "opacity-50" : ""} ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.36)) }}
      role="img"
      aria-label={`${agent.name}, ${agent.role}`}
    >
      {agent.name.slice(0, 2)}
      {dot && (
        <span
          className={`absolute right-0 bottom-0 rounded-full ring-2 ring-white dark:ring-night-2 ${dot} ${status === "working" ? "anim-glow" : ""}`}
          style={{ width: Math.max(7, size * 0.24), height: Math.max(7, size * 0.24) }}
        />
      )}
    </span>
  );
}
