// One page for every room. Pipeline rooms get the task board; others get their own screen.
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useSnapshot, logEvent } from "../lib/hooks";
import { ROOM_BY_ID, agentsInRoom, type RoomId } from "../../shared/registry";
import type { RoomDetail, TaskView } from "../../shared/api";
import { AgentCard } from "../agents/AgentCard";
import { ActivityLog } from "../agents/ActivityLog";
import { Section } from "../components/ui";
import { TaskBoard } from "./shared/TaskBoard";
import { ReviewModal } from "./shared/ReviewModal";
import { ComingSoon } from "./shared/ComingSoon";
import { SuggestionBox } from "./research/SuggestionBox";
import { TrendRadar } from "./research/TrendRadar";
import { BundleBuilder } from "./launch/BundleBuilder";
import { darkFloor } from "../hq/HQMap";

/** Rooms whose agents do real work for real products in Phase 2. */
const REAL_AI_ROOMS: RoomId[] = ["research", "studio", "mockups", "listing", "compliance", "launch"];

// Charts are heavy — only load them when you open the vault.
const FinanceRoom = lazy(() => import("./finance/FinanceRoom").then((m) => ({ default: m.FinanceRoom })));

export function RoomPage() {
  const { id } = useParams();
  const room = ROOM_BY_ID[id as RoomId];
  const { data: snap } = useSnapshot();

  useEffect(() => {
    if (room) logEvent("room_visit");
  }, [room]);

  if (!room) return <p>That room doesn't exist. <Link to="/">Back to HQ</Link></p>;

  return (
    <div className="space-y-4">
      <Link to="/" className="text-sm font-bold text-cocoa hover:underline dark:text-stone-400">
        ← HQ
      </Link>
      <header
        className="card relative overflow-hidden bg-(--floor) p-5 dark:bg-(--floor-dark)"
        style={{ ["--floor" as string]: room.floor, ["--floor-dark" as string]: darkFloor(room.color) }}
      >
        <div className="relative flex flex-wrap items-center gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-3xl shadow-inner sm:h-16 sm:w-16 sm:text-4xl" style={{ background: room.color }} aria-hidden>
            {room.icon}
          </span>
          <div className="min-w-[60%] flex-1">
            <h1 className="text-2xl font-black text-ink dark:text-stone-100">{room.name}</h1>
            <p className="font-semibold text-cocoa dark:text-stone-300">{room.blurb}</p>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            {room.demoInteractive && snap?.aiReady && REAL_AI_ROOMS.includes(room.id) ? (
              <span className="chip bg-sky-100 px-3 py-1 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100">🤖 Real AI (free) for your ideas · demo products stay pretend</span>
            ) : (
              room.demoInteractive && <span className="chip bg-honey/30 px-3 py-1 text-amber-900 dark:text-amber-100">🎮 Demo agents · real AI in Phase {room.phase}</span>
            )}
            {room.phase === 1 && <span className="chip bg-mint/25 px-3 py-1 text-emerald-900 dark:text-emerald-100">✅ Live now</span>}
          </div>
        </div>
      </header>

      {room.id === "finance" ? (
        <Suspense fallback={<p className="py-10 text-center font-bold">Unlocking the vault… 🔐</p>}>
          <FinanceRoom />
        </Suspense>
      ) : room.demoInteractive ? <PipelineRoom roomId={room.id} /> : <ComingSoon roomId={room.id} />}
    </div>
  );
}

function PipelineRoom({ roomId }: { roomId: RoomId }) {
  const { data: snap } = useSnapshot();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const { data } = useQuery({ queryKey: ["room", roomId], queryFn: () => api.get<RoomDetail>(`/rooms/${roomId}`), refetchInterval: 3000 });
  const [open, setOpen] = useState<TaskView | null>(null);
  const retry = useMutation({ mutationFn: (t: TaskView) => api.post(`/tasks/${t.id}/retry`), onSuccess: () => qc.invalidateQueries() });

  // Deep link from the 📥 drawer: /room/research?task=…
  const wanted = params.get("task");
  const wantedTask = useMemo(() => data?.tasks.find((t) => t.id === wanted && t.state === "needs_approval"), [data, wanted]);
  useEffect(() => {
    if (wantedTask) setOpen(wantedTask);
  }, [wantedTask]);

  const agents = agentsInRoom(roomId);
  return (
    <>
      {roomId === "research" && snap && <TrendRadar settings={snap.settings} />}
      {roomId === "research" && <SuggestionBox tasks={data?.tasks ?? []} onOpen={setOpen} aiReady={!!snap?.aiReady} />}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {agents.map((a) => (
          <AgentCard key={a.id} id={a.id} state={snap?.agents.find((s) => s.id === a.id)} />
        ))}
        {agents.length === 0 && (
          <div className="card flex items-center gap-3 p-3">
            <span className="text-4xl">👤</span>
            <div>
              <div className="font-black">You</div>
              <div className="text-sm text-cocoa dark:text-stone-400">The Launch Pad is yours: copy the pack to Etsy, then press launch.</div>
            </div>
          </div>
        )}
      </div>
      {roomId === "launch" && <BundleBuilder />}
      <Section title="Task board" icon="🗂️">
        {data ? <TaskBoard tasks={data.tasks} onOpen={setOpen} onRetry={(t) => retry.mutate(t)} /> : <p>Loading…</p>}
      </Section>
      <Section title="Room log" icon="📒">
        <ActivityLog items={data?.activity ?? []} />
      </Section>
      {snap && (
        <ReviewModal
          task={open}
          settings={snap.settings}
          onClose={() => {
            setOpen(null);
            if (wanted) setParams({}, { replace: true });
          }}
        />
      )}
    </>
  );
}
