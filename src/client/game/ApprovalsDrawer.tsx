import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { api } from "../lib/api";
import { timeAgo } from "../lib/format";
import { Modal } from "../components/ui";
import { ROOM_BY_ID } from "../../shared/registry";
import type { TaskView } from "../../shared/api";

export function ApprovalsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data } = useQuery({ queryKey: ["approvals"], queryFn: () => api.get<{ tasks: TaskView[] }>("/approvals"), enabled: open, refetchInterval: open ? 4000 : false });
  const tasks = data?.tasks ?? [];
  return (
    <Modal open={open} onClose={onClose} title="📥 Waiting for you">
      {tasks.length === 0 ? (
        <p className="py-6 text-center text-cocoa dark:text-stone-400">Nothing to approve. The team is busy! ☕</p>
      ) : (
        <ul className="space-y-2">
          {tasks.map((t) => {
            const room = ROOM_BY_ID[t.room];
            return (
              <li key={t.id}>
                <Link
                  to={`/room/${t.room}?task=${t.id}`}
                  onClick={onClose}
                  className="flex items-center gap-3 rounded-xl p-2.5 ring-1 ring-black/5 hover:bg-black/5 dark:ring-white/10 dark:hover:bg-white/5"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xl" style={{ background: room.floor }} aria-hidden>
                    {room.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{t.title}</span>
                    <span className="block text-xs text-cocoa dark:text-stone-400">
                      {room.name} · {timeAgo(t.updatedAt)}
                    </span>
                  </span>
                  <span className="anim-glow grid h-6 w-6 place-items-center rounded-full bg-amber-400 text-xs font-black text-ink">!</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
