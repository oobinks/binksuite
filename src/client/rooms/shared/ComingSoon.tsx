// Preview screens for rooms that arrive in later phases.
import { useSnapshot } from "../../lib/hooks";
import { ROOM_BY_ID, agentsInRoom, type RoomId } from "../../../shared/registry";
import { AgentCard } from "../../agents/AgentCard";
import { Section } from "../../components/ui";

const PLANS: Partial<Record<RoomId, string[]>> = {
  orders: ["Receipts arrive from the Etsy API (or a CSV import).", "Personalised orders queue up for Crafter, who runs them through the Studio.", "You approve and deliver each order."],
  care: ["Concierge drafts replies and review responses in your tone of voice.", "A template library for common questions.", "You always press send — nothing goes out on its own."],
  marketing: ["Promoter designs Pinterest pins and captions.", "Social post ideas and a content calendar.", "Channel tracking where the data allows."],
  strategy: ["Manager writes a weekly report every Monday (via the cron).", "Suggested next steps based on what's selling.", "Charts: sales, profit by niche, conversion, agent productivity."],
};

export function ComingSoon({ roomId }: { roomId: RoomId }) {
  const { data: snap } = useSnapshot();
  const room = ROOM_BY_ID[roomId];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title={`Coming in Phase ${room.phase}`} right={<span className="chip">Planned</span>}>
        <ul className="space-y-2.5 text-sm text-zinc-700 dark:text-zinc-300">
          {(PLANS[roomId] ?? []).map((p) => (
            <li key={p} className="flex gap-2.5">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-400" aria-hidden />
              <span>{p}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">This area isn't active yet.</p>
      </Section>
      <Section title="Team">
        <div className="space-y-3">
          {agentsInRoom(roomId).map((a) => (
            <AgentCard key={a.id} id={a.id} state={snap?.agents.find((s) => s.id === a.id)} />
          ))}
        </div>
      </Section>
    </div>
  );
}
