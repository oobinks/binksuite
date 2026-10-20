// ⏳ A listing expires on Etsy within a week: keep it (you renew on Etsy) or retire it.
import type { ReviewDef } from "../shared/types";
import { formatGBP } from "../../lib/format";

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
  keep: { label: "✅ Keep it", tone: "bg-emerald-50 dark:bg-emerald-900/25" },
  maybe: { label: "🤔 Worth a refresh", tone: "bg-amber-50 dark:bg-amber-900/25" },
  retire: { label: "🗑️ Let it go", tone: "bg-rose-50 dark:bg-rose-900/25" },
};

export const renewalReview: ReviewDef = {
  approveLabel: "🔁 Keep it (I'll renew on Etsy)",
  rejectLabel: "🗑️ Retire: let it expire",
  startsReady: true,
  Body: ({ task }) => {
    const o = task.output as unknown as Out;
    const v = VERDICT[o.verdict];
    return (
      <div className="space-y-3 text-sm">
        <div className={`rounded-xl p-3 ${v.tone}`}>
          <div className="font-black">
            ⏳ “{o.title}” expires on Etsy in {o.daysLeft} day{o.daysLeft === 1 ? "" : "s"} ({new Date(o.endsAt).toLocaleDateString("en-GB", { day: "numeric", month: "long" })})
          </div>
          <div className="mt-1">
            <b>Recommendation: {v.label}.</b> {o.why}
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
            <div key={label} className="rounded-xl bg-black/5 p-2 dark:bg-white/5">
              <div className="text-xs font-bold">{label}</div>
              <div className="text-xl font-black">{value}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-cocoa dark:text-stone-400">
          {o.daysLive ? `Live for ${o.daysLive} days` : "On Etsy"}
          {o.pricePence ? ` at ${formatGBP(o.pricePence)}` : ""}. Renewing costs Etsy's usual listing fee and gives it another 4 months.
        </p>
        <div className="rounded-xl bg-black/5 p-3 dark:bg-white/5">
          <b>To keep it:</b> open it on Etsy, tick it and tap <b>Renew</b> (or renew it from the listing's page when it expires), then tap Keep below.
          <a className="btn-soft mt-2 block text-center" href={o.manageUrl} target="_blank" rel="noreferrer">
            Open my Etsy listings ↗
          </a>
        </div>
        <p className="text-xs text-cocoa dark:text-stone-400">To retire it, do nothing on Etsy: it simply expires. Its sales history stays in your Finance Vault.</p>
      </div>
    );
  },
};
