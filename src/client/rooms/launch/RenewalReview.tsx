// A listing expires on Etsy within a week: keep it (you renew on Etsy) or retire it.
import type { ReviewDef } from "../shared/types";
import { formatGBP } from "../../lib/format";
import { Icon } from "../../components/Icon";

interface Out {
  title: string;
  endsAt: string;
  daysLeft: number;
  daysLive: number | null;
  sales: number;
  revenuePence: number;
  views: number;
  favourites: number;
  pricePence: number | null;
  verdict: "keep" | "maybe" | "retire";
  why: string;
  manageUrl: string;
}

const VERDICT = {
  keep: { label: "Keep it", dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-300" },
  maybe: { label: "Worth a refresh", dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-300" },
  retire: { label: "Let it go", dot: "bg-rose-500", text: "text-rose-700 dark:text-rose-300" },
};

export const renewalReview: ReviewDef = {
  approveLabel: "Keep it (I'll renew on Etsy)",
  rejectLabel: "Retire: let it expire",
  startsReady: true,
  Body: ({ task }) => {
    const o = task.output as unknown as Out;
    const v = VERDICT[o.verdict];
    return (
      <div className="space-y-3 text-sm">
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="flex items-start gap-2 font-semibold">
            <Icon name="clock" size={15} className={`mt-0.5 shrink-0 ${o.daysLeft <= 1 ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-400"}`} />
            <span>
              “{o.title}” expires on Etsy in {o.daysLeft} day{o.daysLeft === 1 ? "" : "s"} ({new Date(o.endsAt).toLocaleDateString("en-GB", { day: "numeric", month: "long" })})
            </span>
          </div>
          <div className="mt-2 text-zinc-700 dark:text-zinc-300">
            <span className="inline-flex items-center gap-1.5 font-medium">
              Recommendation:
              <span className={`inline-flex items-center gap-1.5 ${v.text}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${v.dot}`} aria-hidden />
                {v.label}
              </span>
            </span>{" "}
            {o.why}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
          {(
            [
              ["Sales", String(o.sales)],
              ["Takings", formatGBP(o.revenuePence)],
              ["Favourites", String(o.favourites)],
              ["Views", String(o.views)],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="rounded-lg border border-zinc-200 p-3 text-left dark:border-white/10">
              <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</div>
              <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {o.daysLive ? `Live for ${o.daysLive} days` : "On Etsy"}
          {o.pricePence ? ` at ${formatGBP(o.pricePence)}` : ""}. Renewing costs Etsy's usual listing fee and gives it another 4 months.
        </p>
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-zinc-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-300">
          <span className="font-medium text-zinc-900 dark:text-zinc-100">To keep it:</span> open it on Etsy, tick it and tap <b>Renew</b> (or renew it from the listing's page when it expires), then tap Keep below.
          <a className="btn-soft mt-3 flex w-full" href={o.manageUrl} target="_blank" rel="noreferrer">
            Open my Etsy listings <Icon name="external" size={14} />
          </a>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">To retire it, do nothing on Etsy: it simply expires. Its sales history stays in your Finance Vault.</p>
      </div>
    );
  },
};
