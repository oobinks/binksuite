import type { ReviewDef } from "../shared/types";
import type { ComplianceCheck } from "../../../shared/compliance";
import { Icon } from "../../components/Icon";

const failing = (out: unknown) => !(out as { pass?: boolean })?.pass;

export const complianceReview: ReviewDef = {
  approveLabel: (t) => (failing(t.output) ? "Override with note" : "Cleared → Launch Pad"),
  rejectLabel: "Send back to Listing Office",
  approveNeedsNote: (t) => failing(t.output),
  startsReady: true,
  Body: ({ task }) => {
    const { checks, pass } = task.output as { checks: ComplianceCheck[]; pass: boolean };
    return (
      <div className="space-y-4">
        <div
          className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium ${pass ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200" : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"}`}
        >
          <Icon name={pass ? "check" : "alert"} size={16} className="mt-px" />
          {pass ? "All hard checks pass. Ready for launch." : "Publishing is blocked until this is fixed, or you override with a note."}
        </div>
        <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-white/[0.06] dark:border-white/10">
          {checks.map((c) => (
            <li key={c.id} className="flex items-start gap-2.5 px-3 py-2.5 text-sm">
              <span className={`mt-0.5 ${c.pass ? "text-emerald-600 dark:text-emerald-400" : c.hard ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-400"}`}>
                <Icon name={c.pass ? "check" : c.hard ? "close" : "alert"} size={15} />
                <span className="sr-only">{c.pass ? "Pass" : c.hard ? "Fail" : "Warning"}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-medium">{c.label}</span>
                <span className="block text-xs text-zinc-500 dark:text-zinc-400">{c.detail}</span>
              </span>
              {!c.hard && <span className="chip">Warning</span>}
            </li>
          ))}
        </ul>
      </div>
    );
  },
};
