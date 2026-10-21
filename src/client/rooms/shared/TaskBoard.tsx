import { motion, AnimatePresence } from "motion/react";
import { AGENT_BY_ID } from "../../../shared/registry";
import { Icon } from "../../components/Icon";
import type { TaskView } from "../../../shared/api";
import { isClaudeWaiting } from "../../../shared/tasks";
import { Avatar } from "../../agents/Avatar";
import { ProgressBar } from "../../components/ui";
import { plain, timeAgo } from "../../lib/format";
import { FormatBadge } from "../../components/FormatBadge";

const COLUMNS: { key: string; title: string; dot: string; states: TaskView["state"][] }[] = [
  { key: "you", title: "Needs you", dot: "bg-amber-500", states: ["needs_approval"] },
  { key: "working", title: "Running", dot: "bg-indigo-500", states: ["working"] },
  { key: "queued", title: "Queued", dot: "bg-zinc-400", states: ["queued", "blocked"] },
  { key: "done", title: "Done", dot: "bg-emerald-500", states: ["done", "failed"] },
];

export function TaskBoard({ tasks, onOpen, onRetry, onReopen }: { tasks: TaskView[]; onOpen: (t: TaskView) => void; onRetry: (t: TaskView) => void; onReopen?: (t: TaskView) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {COLUMNS.map((col) => {
        // A task waiting on Claude is busy, not stuck: it shows under Running.
        const column = (t: TaskView) => (t.state === "blocked" && isClaudeWaiting(t.error) ? "working" : t.state);
        const list = tasks.filter((t) => col.states.includes(column(t))).slice(0, col.key === "done" ? 8 : 20);
        return (
          <div key={col.key} className="rounded-xl bg-zinc-50 p-2.5 dark:bg-white/[0.02]">
            <h4 className="mb-2.5 flex items-center gap-2 px-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              <span className={`h-1.5 w-1.5 rounded-full ${col.dot}`} aria-hidden /> {col.title}
              <span className="ml-auto text-zinc-400 tabular-nums">{list.length}</span>
            </h4>
            <ul className="space-y-2">
              <AnimatePresence initial={false}>
                {list.map((t) => (
                  <motion.li key={t.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                    <TaskCard task={t} onOpen={onOpen} onRetry={onRetry} onReopen={onReopen} />
                  </motion.li>
                ))}
              </AnimatePresence>
              {list.length === 0 && <li className="px-1 py-4 text-center text-xs text-zinc-400 dark:text-zinc-500">Nothing here</li>}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function TaskCard({ task, onOpen, onRetry, onReopen }: { task: TaskView; onOpen: (t: TaskView) => void; onRetry: (t: TaskView) => void; onReopen?: (t: TaskView) => void }) {
  const agent = task.agent ? AGENT_BY_ID[task.agent] : null;
  const needs = task.state === "needs_approval";
  const content = (
    <>
      <div className="flex items-start gap-2">
        {agent ? <Avatar agent={agent} size={24} status={task.state === "working" ? "working" : "idle"} /> : <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-white/[0.06]"><Icon name="user" size={13} /></span>}
        <div className="min-w-0 flex-1">
          <div className="text-[13px] leading-snug font-medium">{plain(task.title)}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            {task.productId && <FormatBadge format={task.productFormat} />}
            {agent?.name ?? "You"} · {timeAgo(task.updatedAt)}
          </div>
        </div>
        {needs && <span className="anim-glow mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-label="Needs you" />}
      </div>
      {task.state === "working" && <ProgressBar value={task.progress} className="mt-2.5" label="Progress" />}
      {task.state === "blocked" &&
        (isClaudeWaiting(task.error) ? (
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-violet-700 dark:text-violet-300">
            <Icon name="sparkles" size={12} className="anim-glow" /> With Claude: ready when Claude's session finishes
          </p>
        ) : (
          <p className="mt-1.5 text-xs text-rose-600 dark:text-rose-400">{plain(task.error ?? "Blocked")}</p>
        ))}
      {task.state === "failed" && (
        <p className="mt-1.5 text-xs text-rose-600 dark:text-rose-400">
          {task.error ?? "Failed"}{" "}
          <button className="font-medium underline" onClick={(e) => (e.stopPropagation(), onRetry(task))}>
            Retry
          </button>
        </p>
      )}
      {task.note && task.state !== "failed" && <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">{plain(task.note)}</p>}
      {task.state === "done" && task.productId && onReopen && (
        <button
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`Reopen “${plain(task.title)}”? It goes back to waiting for you, so you can review it again. Anything started after it is cancelled.`)) onReopen(task);
          }}
        >
          <Icon name="refresh" size={12} /> Reopen
        </button>
      )}
    </>
  );
  return needs ? (
    <button onClick={() => onOpen(task)} className="block w-full rounded-lg border border-amber-300 bg-white p-3 text-left shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition hover:border-amber-400 hover:shadow-sm dark:border-amber-500/40 dark:bg-night-2">
      {content}
      <span className="mt-2.5 flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-300">Review <Icon name="arrowRight" size={13} /></span>
    </button>
  ) : (
    <div className="rounded-lg border border-zinc-200/80 bg-white p-3 dark:border-white/[0.07] dark:bg-night-2">{content}</div>
  );
}
