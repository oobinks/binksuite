import { motion, AnimatePresence } from "motion/react";
import { AGENT_BY_ID, ROOM_BY_ID } from "../../../shared/registry";
import type { TaskView } from "../../../shared/api";
import { Avatar } from "../../agents/Avatar";
import { ProgressBar } from "../../components/ui";
import { timeAgo } from "../../lib/format";

const COLUMNS: { key: string; title: string; icon: string; states: TaskView["state"][] }[] = [
  { key: "you", title: "Needs you", icon: "❗", states: ["needs_approval"] },
  { key: "working", title: "Working", icon: "⚙️", states: ["working"] },
  { key: "queued", title: "Queued", icon: "🗂️", states: ["queued", "blocked"] },
  { key: "done", title: "Done", icon: "✅", states: ["done", "failed"] },
];

export function TaskBoard({ tasks, onOpen, onRetry, locked }: { tasks: TaskView[]; onOpen: (t: TaskView) => void; onRetry: (t: TaskView) => void; locked: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {COLUMNS.map((col) => {
        const list = tasks.filter((t) => col.states.includes(t.state)).slice(0, col.key === "done" ? 8 : 20);
        return (
          <div key={col.key} className="rounded-2xl bg-black/[0.03] p-2.5 dark:bg-white/[0.03]">
            <h4 className="mb-2 flex items-center gap-1.5 px-1 text-sm font-black">
              <span aria-hidden>{col.icon}</span> {col.title}
              <span className="chip ml-auto">{list.length}</span>
            </h4>
            <ul className="space-y-2">
              <AnimatePresence initial={false}>
                {list.map((t) => (
                  <motion.li key={t.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                    <TaskCard task={t} onOpen={onOpen} onRetry={onRetry} locked={locked} />
                  </motion.li>
                ))}
              </AnimatePresence>
              {list.length === 0 && <li className="px-1 py-3 text-center text-xs text-cocoa/70 dark:text-stone-500">Empty</li>}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function TaskCard({ task, onOpen, onRetry, locked }: { task: TaskView; onOpen: (t: TaskView) => void; onRetry: (t: TaskView) => void; locked: boolean }) {
  const agent = task.agent ? AGENT_BY_ID[task.agent] : null;
  const room = ROOM_BY_ID[task.room];
  const needs = task.state === "needs_approval";
  const content = (
    <>
      <div className="flex items-start gap-2">
        {agent ? <Avatar agent={agent} size={28} showProp={false} status={task.state === "working" ? "working" : "idle"} /> : <span className="text-xl">🧑‍💼</span>}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold leading-tight">{task.title}</div>
          <div className="text-[11px] text-cocoa dark:text-stone-400">
            {agent?.name ?? "You"} · {timeAgo(task.updatedAt)}
          </div>
        </div>
        {needs && <span className="anim-glow grid h-5 w-5 shrink-0 place-items-center rounded-full bg-amber-400 text-[11px] font-black text-ink">!</span>}
      </div>
      {task.state === "working" && <ProgressBar value={task.progress} color={room.color} className="mt-2" label="Progress" />}
      {task.state === "blocked" && <p className="mt-1 text-xs font-bold text-rose-600">⛔ {task.error}</p>}
      {task.state === "queued" && locked && <p className="mt-1 text-xs font-bold text-cocoa">🔒 Waiting for this room to unlock</p>}
      {task.state === "failed" && (
        <p className="mt-1 text-xs font-bold text-rose-600">
          {task.error ?? "Failed"}{" "}
          <button className="underline" onClick={(e) => (e.stopPropagation(), onRetry(task))}>
            Retry
          </button>
        </p>
      )}
      {task.note && task.state !== "failed" && <p className="mt-1 text-xs italic text-cocoa dark:text-stone-400">📝 {task.note}</p>}
    </>
  );
  return needs && !locked ? (
    <button onClick={() => onOpen(task)} className="block w-full rounded-xl bg-white p-2.5 text-left ring-2 ring-amber-300 transition hover:-translate-y-0.5 dark:bg-night-2">
      {content}
      <span className="mt-2 block text-center text-xs font-black text-amber-700 dark:text-amber-300">Tap to review →</span>
    </button>
  ) : (
    <div className="rounded-xl bg-white p-2.5 ring-1 ring-black/5 dark:bg-night-2 dark:ring-white/10">{content}</div>
  );
}
