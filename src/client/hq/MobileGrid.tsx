// Phone layout: the floor plan becomes a scrollable 2-column grid of room cards.
import { useEffect } from "react";
import { Link } from "react-router";
import { AGENTS, ROOMS, ROOM_BY_ID } from "../../shared/registry";
import type { Snapshot } from "../../shared/api";
import { Avatar } from "../agents/Avatar";
import { useUi } from "../lib/store";
import { darkFloor } from "./HQMap";

export function MobileGrid({ snap }: { snap: Snapshot }) {
  const parcels = useUi((s) => s.parcels);
  const arrived = useUi((s) => s.parcelArrived);
  const toast = useUi((s) => s.toast);
  // No room to fly parcels on a phone — announce them instead.
  useEffect(() => {
    for (const p of parcels) {
      toast({ icon: "📦", title: `${ROOM_BY_ID[p.from].icon} → ${ROOM_BY_ID[p.to].icon} ${ROOM_BY_ID[p.to].name}`, body: p.productTitle });
      arrived(p.id);
    }
  }, [parcels, arrived, toast]);

  return (
    <div className="grid grid-cols-2 gap-3">
      {ROOMS.map((room) => {
        const st = snap.rooms.find((r) => r.id === room.id)!;
        const agents = AGENTS.filter((a) => a.room === room.id);
        const locked = !st.unlocked;
        return (
          <Link
            key={room.id}
            to={`/room/${room.id}`}
            className={`relative overflow-hidden rounded-2xl border-4 bg-(--floor) p-3 dark:bg-(--floor-dark) ${locked ? "grayscale" : ""}`}
            style={{ ["--floor" as string]: room.floor, ["--floor-dark" as string]: darkFloor(room.color), borderColor: room.color }}
            aria-label={`${room.name}${locked ? `, locked until level ${room.unlockLevel}` : ""}`}
          >
            <div className="relative">
              <div className="flex items-start justify-between">
                <span className="text-3xl" aria-hidden>
                  {room.icon}
                </span>
                {st.needsYou > 0 && <span className="anim-glow grid h-6 min-w-6 place-items-center rounded-full bg-amber-400 px-1 text-xs font-black text-ink">❗{st.needsYou}</span>}
              </div>
              <div className="mt-1 text-sm font-black leading-tight text-ink dark:text-stone-100">{room.name}</div>
              {locked ? (
                <div className="mt-2 text-xs font-bold text-cocoa dark:text-stone-300">🔒 Lv {room.unlockLevel}</div>
              ) : (
                <>
                  <div className="mt-2 flex -space-x-2">
                    {agents.map((a) => (
                      <Avatar key={a.id} agent={a} size={30} showProp={false} status={snap.agents.find((s) => s.id === a.id)?.status} />
                    ))}
                    {agents.length === 0 && <span className="text-xs font-semibold text-cocoa dark:text-stone-300">{room.id === "launch" ? "You're in charge" : "Your vault"}</span>}
                  </div>
                  {st.queued + st.working > 0 && <div className="mt-1 text-[11px] font-bold text-cocoa dark:text-stone-300">🗂️ {st.queued + st.working} in queue</div>}
                </>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
