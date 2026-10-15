import type { ReviewDef } from "../shared/types";
import { calculateFees } from "../../../shared/fees";
import { formatGBP } from "../../lib/format";

interface Out {
  pricePence: number;
  floorPence: number;
  netPence: number;
  feesPence: number;
  minProfitPence: number;
}

export const listingReview: ReviewDef = {
  approveLabel: "👍 Approve price → Compliance",
  rejectLabel: "🔁 Re-price",
  startsReady: true,
  Body: ({ task, settings }) => {
    const o = task.output as unknown as Out;
    const fees = calculateFees({ pricePence: o.pricePence, costPence: 10 }, settings.fees);
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-amber-100 p-2 dark:bg-amber-900/30">
            <div className="text-xs font-bold">Price</div>
            <div className="text-xl font-black">{formatGBP(o.pricePence)}</div>
          </div>
          <div className="rounded-xl bg-black/5 p-2 dark:bg-white/5">
            <div className="text-xs font-bold">Etsy fees</div>
            <div className="text-xl font-black">{formatGBP(fees.totalFeesPence)}</div>
          </div>
          <div className="rounded-xl bg-emerald-100 p-2 dark:bg-emerald-900/30">
            <div className="text-xs font-bold">You keep</div>
            <div className="text-xl font-black">{formatGBP(fees.netPence)}</div>
          </div>
        </div>
        <ul className="space-y-1 text-sm">
          {fees.lines.map((l) => (
            <li key={l.key} className="flex justify-between">
              <span>{l.label}</span>
              <span>{formatGBP(l.pence)}</span>
            </li>
          ))}
          <li className="flex justify-between">
            <span>VAT on fees</span>
            <span>{formatGBP(fees.vatPence)}</span>
          </li>
          <li className="flex justify-between">
            <span>AI cost (estimate)</span>
            <span>{formatGBP(fees.costPence)}</span>
          </li>
        </ul>
        <p className="rounded-xl bg-black/5 p-2 text-xs dark:bg-white/5">
          Pricer's floor for at least {formatGBP(o.minProfitPence)} profit: <b>{formatGBP(o.floorPence)}</b>. Change your minimum profit in Settings.
        </p>
      </div>
    );
  },
};
