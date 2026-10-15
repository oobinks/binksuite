import { useParams, Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useSnapshot, useSaveSettings } from "../lib/hooks";
import { AGENT_BY_ID, ROOM_BY_ID, type AgentId } from "../../shared/registry";
import type { RoomDetail } from "../../shared/api";
import { Avatar } from "./Avatar";
import { ActivityLog } from "./ActivityLog";
import { ProgressBar, Section, StatusPill, Toggle } from "../components/ui";
import { timeAgo } from "../lib/format";

export function AgentPage() {
  const { id } = useParams();
  const agent = AGENT_BY_ID[id as AgentId];
  const { data: snap } = useSnapshot();
  const save = useSaveSettings();
  const { data } = useQuery({ queryKey: ["agent", id], queryFn: () => api.get<RoomDetail>(`/agents/${id}`), refetchInterval: 4000, enabled: !!agent });
  if (!agent) return <p>Unknown agent.</p>;
  const room = ROOM_BY_ID[agent.room];
  const st = snap?.agents.find((a) => a.id === agent.id);
  const enabled = snap?.settings.agentsEnabled[agent.id] !== false;
  return (
    <div className="space-y-4">
      <Link to={`/room/${room.id}`} className="text-sm font-bold text-cocoa hover:underline dark:text-stone-400">
        ← {room.icon} {room.name}
      </Link>
      <div className="card flex flex-col items-center gap-4 p-5 sm:flex-row" style={{ borderTop: `6px solid ${room.color}` }}>
        <Avatar agent={agent} status={st?.status} size={110} />
        <div className="flex-1 text-center sm:text-left">
          <h1 className="text-3xl font-black">{agent.name}</h1>
          <p className="font-semibold text-cocoa dark:text-stone-400">
            {agent.role} · {room.icon} {room.name}
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            {st && <StatusPill status={st.status} />}
            {st && <span className="text-sm italic">“{st.bubble}”</span>}
          </div>
          {st?.status === "working" && <ProgressBar value={st.progress} color={room.color} className="mt-3 max-w-sm" label="Progress" />}
        </div>
        <label className="flex items-center gap-2 text-sm font-bold">
          On duty
          <Toggle checked={enabled} onChange={(v) => save.mutate({ agentsEnabled: { [agent.id]: v } })} label={`${agent.name} on duty`} />
        </label>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Activity log" icon="📒">
          <ActivityLog items={data?.activity ?? []} empty={`${agent.name} hasn't done anything yet.`} />
        </Section>
        <Section title="Recent tasks" icon="🗂️">
          <ul className="space-y-1.5 text-sm">
            {(data?.tasks ?? []).map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2">
                <span className="truncate">{t.title}</span>
                <span className="chip shrink-0">
                  {t.state.replace("_", " ")} · {timeAgo(t.updatedAt)}
                </span>
              </li>
            ))}
            {!data?.tasks.length && <li className="text-cocoa dark:text-stone-400">No tasks yet.</li>}
          </ul>
        </Section>
      </div>
    </div>
  );
}
