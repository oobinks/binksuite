import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { formatGBP } from "../lib/format";
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
    <Modal open={open} onClose={close} title="☕ Daily briefing">
      {!b ? (
        <p className="py-6 text-center">Brewing…</p>
      ) : (
        <div className="space-y-4">
          <p className="font-semibold">{b.greeting}</p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat icon="🛍️" label="Sales yesterday" value={String(b.yesterday.sales)} />
            <Stat icon="🪙" label="Net yesterday" value={formatGBP(b.yesterday.netPence)} />
            <Stat icon="📥" label="Waiting for you" value={String(b.approvalsWaiting)} />
          </div>
          <div>
            <div className="mb-1 flex justify-between text-sm font-bold">
              <span>This month's profit goal</span>
              <span>
                {formatGBP(b.monthProfitPence)} / {formatGBP(b.monthlyTargetPence)}
              </span>
            </div>
            <ProgressBar value={b.monthlyTargetPence ? b.monthProfitPence / b.monthlyTargetPence : 0} color="#5bbf9a" label="Monthly profit goal" />
          </div>
          {b.highlights.length > 0 && (
            <div>
              <h4 className="label">From the team</h4>
              <ul className="space-y-1 text-sm">
                {b.highlights.map((h, i) => (
                  <li key={i}>• {h}</li>
                ))}
              </ul>
            </div>
          )}
          {b.quests.length > 0 && (
            <div>
              <h4 className="label">Today's quests</h4>
              <ul className="space-y-1.5 text-sm">
                {b.quests.map((q) => (
                  <li key={q.title} className="flex items-center gap-2">
                    <span aria-hidden>{q.icon}</span>
                    <span className="flex-1">{q.title}</span>
                    <span className="font-bold">
                      {q.progress}/{q.target}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button className="btn-primary w-full" onClick={close}>
            Let's go! ✨
          </button>
        </div>
      )}
    </Modal>
  );
}

function Stat({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-black/5 p-2 dark:bg-white/5">
      <div className="text-xl" aria-hidden>
        {icon}
      </div>
      <div className="text-lg font-black">{value}</div>
      <div className="text-[11px] font-semibold text-cocoa dark:text-stone-400">{label}</div>
    </div>
  );
}
