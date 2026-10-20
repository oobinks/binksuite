import { useParams, Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useSnapshot, useSaveSettings } from "../lib/hooks";
import { AGENT_BY_ID, ROOM_BY_ID, type AgentId } from "../../shared/registry";
import type { RoomDetail } from "../../shared/api";
import { Avatar } from "./Avatar";
import { ActivityLog } from "./ActivityLog";
import { ProgressBar, Section, StatusPill, Toggle } from "../components/ui";
import { plain, timeAgo } from "../lib/format";
import { PageHeader } from "../components/PageHeader";

export function AgentPage() {
  const { id } = useParams();
  const agent = AGENT_BY_ID[id as AgentId];
  const { data: snap } = useSnapshot();
  const save = useSaveSettings();
  const { data } = useQuery({ queryKey: ["agent", id], queryFn: () => api.get<RoomDetail>(`/agents/${id}`), refetchInterval: 4000, enabled: !!agent });
  if (!agent) return <p className="text-sm text-zinc-500">Unknown agent.</p>;
  const room = ROOM_BY_ID[agent.room];
  const st = snap?.agents.find((a) => a.id === agent.id);
  const enabled = snap?.settings.agentsEnabled[agent.id] !== false;
  return (
    <div className="space-y-6">
      <PageHeader
        title={agent.name}
        subtitle={
          <>
            {agent.role} · <Link to={`/room/${room.id}`} className="hover:text-zinc-900 hover:underline dark:hover:text-white">{plain(room.name)}</Link>
          </>
        }
        back="/"
        crumb="Dashboard"
        right={
          <label className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            On duty
            <Toggle checked={enabled} onChange={(v) => save.mutate({ agentsEnabled: { [agent.id]: v } })} label={`${agent.name} on duty`} />
          </label>
        }
      />
      <div className="card flex items-center gap-4 p-4 sm:p-5">
        <Avatar agent={agent} status={st?.status} size={48} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {st && <StatusPill status={st.status} />}
            {st?.bubble && <span className="truncate text-sm text-zinc-500 dark:text-zinc-400">{plain(st.bubble)}</span>}
          </div>
          {st?.status === "working" && <ProgressBar value={st.progress} className="mt-3 max-w-sm" label="Progress" />}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Activity log">
          <ActivityLog items={data?.activity ?? []} empty={`${agent.name} hasn't done anything yet.`} />
        </Section>
        <Section title="Recent tasks">
          <ul className="divide-y divide-zinc-100 text-sm dark:divide-white/[0.06]">
            {(data?.tasks ?? []).map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <span className="truncate text-zinc-700 dark:text-zinc-300">{plain(t.title)}</span>
                <span className="shrink-0 text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
                  <span className="capitalize">{t.state.replace("_", " ")}</span> · {timeAgo(t.updatedAt)}
                </span>
              </li>
            ))}
            {!data?.tasks.length && <li className="text-zinc-500 dark:text-zinc-400">No tasks yet.</li>}
          </ul>
        </Section>
      </div>
    </div>
  );
}
