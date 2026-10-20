import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { formatGBP, plain } from "../lib/format";
import { Modal, ProgressBar } from "../components/ui";
import type { Briefing } from "../../shared/api";

export function BriefingModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: b } = useQuery({ queryKey: ["briefing"], queryFn: () => api.get<Briefing>("/briefing"), enabled: open });
  const close = async () => {
    onClose();
    await api.post("/briefing/seen").catch(() => {});
    qc.invalidateQueries({ queryKey: ["state"] });
  };
  return (
    <Modal open={open} onClose={close} title="Daily briefing">
      {!b ? (
        <p className="py-6 text-center text-sm text-zinc-500">Loading…</p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-zinc-700 dark:text-zinc-300">{plain(b.greeting)}</p>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Sales yesterday" value={String(b.yesterday.sales)} />
            <Stat label="Net yesterday" value={formatGBP(b.yesterday.netPence)} />
            <Stat label="Waiting for you" value={String(b.approvalsWaiting)} />
          </div>
          <div>
            <div className="mb-1.5 flex justify-between text-sm">
              <span>This month's profit goal</span>
              <span>
                {formatGBP(b.monthProfitPence)} / {formatGBP(b.monthlyTargetPence)}
              </span>
            </div>
            <ProgressBar value={b.monthlyTargetPence ? b.monthProfitPence / b.monthlyTargetPence : 0} color="#10b981" label="Monthly profit goal" />
          </div>
          {b.highlights.length > 0 && (
            <div>
              <h4 className="label">From the team</h4>
              <ul className="space-y-1 text-sm">
                {b.highlights.map((h, i) => (
                  <li key={i} className="flex gap-2 text-zinc-700 dark:text-zinc-300"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-zinc-400" />{plain(h)}</li>
                ))}
              </ul>
            </div>
          )}
          {b.quests.length > 0 && (
            <div>
              <h4 className="label">Today's goals</h4>
              <ul className="space-y-1.5 text-sm">
                {b.quests.map((q) => (
                  <li key={q.title} className="flex items-center gap-2">
                    <span className="flex-1 text-zinc-700 dark:text-zinc-300">{plain(q.title)}</span>
                    <span className="font-medium tabular-nums">
                      {q.progress}/{q.target}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button className="btn-primary w-full" onClick={close}>
            Done
          </button>
        </div>
      )}
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-3 text-left dark:border-white/10">
      <div className="text-[11px] text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
