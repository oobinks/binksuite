import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { api } from "../lib/api";
import { plain, timeAgo } from "../lib/format";
import { Modal } from "../components/ui";
import { Icon } from "../components/Icon";
import { ROOM_ICON, ROOM_LABEL, ROOM_TONE } from "../lib/rooms";
import type { TaskView } from "../../shared/api";

export function ApprovalsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data } = useQuery({ queryKey: ["approvals"], queryFn: () => api.get<{ tasks: TaskView[] }>("/approvals"), enabled: open, refetchInterval: open ? 4000 : false });
  const tasks = data?.tasks ?? [];
  return (
    <Modal open={open} onClose={onClose} title="Waiting for you">
      {tasks.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">Nothing to approve right now.</p>
      ) : (
        <ul className="-mx-2 divide-y divide-zinc-100 dark:divide-white/[0.06]">
          {tasks.map((t) => {
            return (
              <li key={t.id}>
                <Link
                  to={`/room/${t.room}?task=${t.id}`}
                  onClick={onClose}
                  className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-zinc-50 dark:hover:bg-white/[0.04]"
                >
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${ROOM_TONE[t.room].tile}`} aria-hidden>
                    <Icon name={ROOM_ICON[t.room]} size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{plain(t.title)}</span>
                    <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                      {ROOM_LABEL[t.room]} · {timeAgo(t.updatedAt)}
                    </span>
                  </span>
                  <Icon name="chevronRight" size={16} className="text-zinc-400" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
