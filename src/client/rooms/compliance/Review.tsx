import type { ReviewDef } from "../shared/types";
import type { ComplianceCheck } from "../../../shared/compliance";

const failing = (out: unknown) => !(out as { pass?: boolean })?.pass;

export const complianceReview: ReviewDef = {
  approveLabel: (t) => (failing(t.output) ? "⚠️ Override with note" : "✅ Cleared → Launch Pad"),
  rejectLabel: "↩️ Send back to Listing Office",
  approveNeedsNote: (t) => failing(t.output),
  startsReady: true,
  Body: ({ task }) => {
    const { checks, pass } = task.output as { checks: ComplianceCheck[]; pass: boolean };
    return (
      <div className="space-y-3">
        <div className={`rounded-xl p-3 font-bold ${pass ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200" : "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-200"}`}>
          {pass ? "✅ All hard checks pass. Ready for launch." : "⛔ Publishing is blocked until this is fixed — or you override with a note."}
        </div>
        <ul className="space-y-1.5">
          {checks.map((c) => (
            <li key={c.id} className="flex items-start gap-2 text-sm">
              <span aria-hidden>{c.pass ? "✅" : c.hard ? "❌" : "⚠️"}</span>
              <span className="flex-1">
                <b>{c.label}</b>
                <span className="block text-xs text-cocoa dark:text-stone-400">{c.detail}</span>
              </span>
              {!c.hard && <span className="chip">warning</span>}
            </li>
          ))}
        </ul>
      </div>
    );
  },
};
