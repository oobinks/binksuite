// The flat top-down HQ floor plan (tablet/desktop). On phones, MobileGrid is used instead.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { AGENTS, ROOMS, ROOM_BY_ID, type AgentDef, type RoomDef } from "../../shared/registry";
import type { AgentSnapshot, RoomSnapshot, Snapshot } from "../../shared/api";
import { Avatar } from "../agents/Avatar";
import { useUi } from "../lib/store";
import { hashString, mulberry32 } from "../../shared/rng";

const CORRIDOR_Y = 39;

export function HQMap({ snap }: { snap: Snapshot }) {
  const roomState = useMemo(() => new Map(snap.rooms.map((r) => [r.id, r])), [snap.rooms]);
  const agentState = useMemo(() => new Map(snap.agents.map((a) => [a.id, a])), [snap.agents]);
  return (
    <div className="card relative w-full overflow-hidden p-0" style={{ aspectRatio: "16 / 10.5" }}>
      {/* hallway carpet */}
      <div className="floor-boards absolute inset-0 bg-[#efe3cf] dark:bg-[#2b2620]" />
      <div className="absolute inset-x-[1%] rounded-full bg-[#d9b99b]/60 dark:bg-[#5a4636]/50" style={{ top: `${CORRIDOR_Y - 2.4}%`, height: "4.8%" }} />
      <div className="absolute inset-x-[1%] rounded-full bg-[#d9b99b]/50 dark:bg-[#5a4636]/40" style={{ top: "69.6%", height: "3%" }} />
      <span className="absolute left-1/2 -translate-x-1/2 text-[10px] font-black tracking-[0.3em] text-cocoa/50 uppercase dark:text-stone-500" style={{ top: `${CORRIDOR_Y - 1}%` }}>
        Hallway
      </span>

      {ROOMS.map((room) => (
        <RoomTile key={room.id} room={room} state={roomState.get(room.id)!} agents={AGENTS.filter((a) => a.room === room.id)} agentState={agentState} />
      ))}

      <Parcels />
    </div>
  );
}

function RoomTile({ room, state, agents, agentState }: { room: RoomDef; state: RoomSnapshot; agents: AgentDef[]; agentState: Map<string, AgentSnapshot> }) {
  // Rooms whose real work arrives in a later phase get a small "soon" tag.
  const soon = !room.demoInteractive && room.phase > 1;
  const { x, y, w, h } = room.map;
  return (
    <Link
      to={`/room/${room.id}`}
      aria-label={`${room.name}${soon ? `, coming in Phase ${room.phase}` : ""}${state.needsYou ? `, ${state.needsYou} waiting for you` : ""}`}
      className="group absolute block focus:outline-none"
      style={{ left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%` }}
    >
      <div
        className={`floor-boards absolute inset-0 rounded-[14px] border-[5px] bg-(--floor) transition group-hover:brightness-[1.03] group-focus-visible:ring-4 group-focus-visible:ring-honey dark:bg-(--floor-dark) dark:shadow-none`}
        style={{ ["--floor" as string]: room.floor, ["--floor-dark" as string]: darkFloor(room.color), borderColor: room.color, boxShadow: `inset 0 0 0 2px rgba(255,255,255,.5), 0 6px 0 ${room.color}55` }}
      />
      {/* door gap */}
      <div className="absolute h-[5px] w-[18%] bg-[#efe3cf] dark:bg-[#2b2620]" style={{ left: "41%", bottom: y < 40 ? -0.5 : undefined, top: y < 40 ? undefined : -0.5 }} />

      {/* name plate */}
      <div className="absolute left-2 top-1.5 flex items-center gap-1 rounded-lg bg-white/85 px-1.5 py-0.5 text-[clamp(9px,1.05vw,13px)] font-black text-ink shadow-sm dark:bg-night-2/90 dark:text-stone-100">
        <span aria-hidden>{room.icon}</span>
        {room.name}
      </div>

      {/* furniture */}
      {room.furniture.map((f, i) => (
        <span key={i} className="absolute select-none text-[clamp(14px,1.8vw,26px)] opacity-90" style={{ left: `${[12, 70, 40][i]}%`, top: `${[58, 52, 74][i]}%` }} aria-hidden>
            {f}
          </span>
        ))}

      {/* badges */}
      <div className="absolute right-1.5 top-1.5 flex items-center gap-1">
        {soon && <span className="chip bg-white/85 text-[10px] text-cocoa dark:bg-night-2/90 dark:text-stone-300">🚧 Phase {room.phase}</span>}
        {state.queued + state.working > 0 && (
          <span className="chip bg-white/85 text-[10px] text-ink dark:bg-night-2/90 dark:text-stone-100" title="Tasks in the queue">
            🗂️ {state.queued + state.working}
          </span>
        )}
        {state.blocked > 0 && <span className="chip bg-rose-100 text-[10px] text-rose-700">⛔ {state.blocked}</span>}
        {state.needsYou > 0 && (
          <span className={`grid h-6 min-w-6 place-items-center rounded-full bg-amber-400 px-1 text-xs font-black text-ink anim-glow`} title="Waiting for your approval">
            ❗{state.needsYou > 1 ? state.needsYou : ""}
          </span>
        )}
      </div>

      {agents.map((a, i) => (
        <WanderingAgent key={a.id} agent={a} index={i} count={agents.length} state={agentState.get(a.id)} />
      ))}
    </Link>
  );
}

/** Agents drift around their room when idle and sit at their desk when working. */
function WanderingAgent({ agent, index, count, state }: { agent: AgentDef; index: number; count: number; state?: AgentSnapshot }) {
  const status = state?.status ?? "idle";
  // Neighbours sit at staggered heights so their speech bubbles don't collide.
  const home = { x: 14 + ((index + 0.5) * 70) / count, y: 30 + (index % 2) * 24 };
  const [pos, setPos] = useState(home);
  useEffect(() => {
    if (status === "working" || status === "needs_you" || status === "off") {
      setPos(status === "needs_you" ? { x: home.x, y: 42 } : home);
      return;
    }
    const rng = mulberry32(hashString(agent.id) + Date.now());
    const move = () => setPos({ x: 8 + rng() * 64, y: 26 + rng() * 34 });
    const id = setInterval(move, 3500 + rng() * 3000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, agent.id]);
  const showBubble = status === "working" || status === "needs_you" || status === "blocked" || status === "done";
  return (
    <motion.div
      className="absolute"
      style={{ width: "clamp(30px, 3.6vw, 52px)" }}
      initial={false}
      animate={{ left: `${pos.x}%`, top: `${pos.y}%` }}
      transition={{ duration: 2.4, ease: "easeInOut" }}
    >
      <AnimatePresence>
        {showBubble && state && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-full left-1/2 z-10 mb-0.5 w-max max-w-[120px] -translate-x-1/2 rounded-xl bg-white px-1.5 py-0.5 text-center text-[clamp(8px,0.8vw,11px)] font-bold leading-tight text-ink shadow-md dark:bg-night-3 dark:text-stone-100"
          >
            {state.bubble}
            {status === "working" && (
              <span className="mt-0.5 block h-1 overflow-hidden rounded bg-black/10">
                <span className="block h-full bg-sky-400 transition-all" style={{ width: `${state.progress * 100}%` }} />
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <Avatar agent={agent} status={status} size={44} showProp={status !== "idle"} />
    </motion.div>
  );
}

/** A deep, cosy version of the room colour for dark mode. */
export function darkFloor(color: string) {
  return `color-mix(in oklab, ${color} 26%, #1e1b24)`;
}

function center(id: keyof typeof ROOM_BY_ID) {
  const m = ROOM_BY_ID[id].map;
  return { x: m.x + m.w / 2, y: m.y + m.h / 2 };
}

/** 📦 parcels travel room → hallway → room when work is handed off. */
function Parcels() {
  const parcels = useUi((s) => s.parcels);
  const arrived = useUi((s) => s.parcelArrived);
  return (
    <div className="pointer-events-none absolute inset-0">
      {parcels.map((p) => {
        const a = center(p.from);
        const b = center(p.to);
        return (
          <motion.div
            key={p.id}
            className="absolute z-20 -translate-x-1/2 -translate-y-1/2 text-[clamp(18px,2.2vw,30px)] drop-shadow"
            initial={{ left: `${a.x}%`, top: `${a.y}%`, scale: 0.4, opacity: 0 }}
            animate={{
              left: [`${a.x}%`, `${a.x}%`, `${b.x}%`, `${b.x}%`],
              top: [`${a.y}%`, `${CORRIDOR_Y}%`, `${CORRIDOR_Y}%`, `${b.y}%`],
              scale: [0.6, 1, 1, 0.8],
              opacity: [1, 1, 1, 0],
            }}
            transition={{ duration: 4.2, times: [0, 0.25, 0.75, 1], ease: "easeInOut" }}
            onAnimationComplete={() => arrived(p.id)}
            title={`${p.productTitle}: ${ROOM_BY_ID[p.from].name} → ${ROOM_BY_ID[p.to].name}`}
          >
            📦
            <span className="absolute left-1/2 top-full mt-0.5 w-max max-w-[160px] -translate-x-1/2 truncate rounded bg-ink/80 px-1 text-[10px] font-bold text-cream">{p.productTitle}</span>
          </motion.div>
        );
      })}
    </div>
  );
}
