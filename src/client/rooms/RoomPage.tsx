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
import { Icon } from "../components/Icon";
import { TaskBoard } from "./shared/TaskBoard";
import { ReviewModal } from "./shared/ReviewModal";
import { ComingSoon } from "./shared/ComingSoon";
import { SuggestionBox } from "./research/SuggestionBox";
import { TrendRadar } from "./research/TrendRadar";
import { BundleBuilder } from "./launch/BundleBuilder";
import { OrdersDesk } from "./orders/OrdersDesk";
import { LiveProducts } from "./launch/LiveProducts";
import { PageHeader } from "../components/PageHeader";
import { ROOM_ICON, ROOM_LABEL } from "../lib/rooms";
import { plain } from "../lib/format";

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

  if (!room) return <p className="text-sm">That page doesn't exist. <Link className="underline" to="/">Back to the dashboard</Link></p>;

  const aiNote = room.demoInteractive && snap?.aiReady && REAL_AI_ROOMS.includes(room.id) ? "Real AI" : room.demoInteractive ? "Demo agents" : null;
  return (
    <div className="space-y-6">
      <PageHeader
        title={ROOM_LABEL[room.id]}
        subtitle={plain(room.blurb)}
        icon={ROOM_ICON[room.id]}
        back="/"
        crumb="Dashboard"
        right={aiNote && <span className="chip" title={aiNote === "Real AI" ? "Real AI works on your ideas; demo products stay pretend." : `Real AI arrives in Phase ${room.phase}.`}>{aiNote}</span>}
      />

      {room.id === "finance" ? (
        <Suspense fallback={<p className="py-10 text-center text-sm text-zinc-500">Loading finance…</p>}>
          <FinanceRoom />
        </Suspense>
      ) : room.id === "orders" ? (
        <OrdersDesk />
      ) : room.demoInteractive ? (
        <PipelineRoom roomId={room.id} />
      ) : (
        <ComingSoon roomId={room.id} />
      )}
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

  // Deep link from the approvals drawer: /room/research?task=…
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
          <div className="card flex items-center gap-3 p-4">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-zinc-100 text-zinc-600 dark:bg-white/[0.06] dark:text-zinc-300">
              <Icon name="user" size={18} />
            </span>
            <div>
              <div className="text-sm font-semibold">You</div>
              <div className="text-sm text-cocoa dark:text-stone-400">The Launch Pad is yours: copy the pack to Etsy, then press launch.</div>
            </div>
          </div>
        )}
      </div>
      {roomId === "launch" && <LiveProducts />}
      {roomId === "launch" && <BundleBuilder />}
      <Section title="Task board">
        {data ? <TaskBoard tasks={data.tasks} onOpen={setOpen} onRetry={(t) => retry.mutate(t)} /> : <p>Loading…</p>}
      </Section>
      <Section title="Activity">
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
