// Price Watch alert: one of your live listings is priced well above the market.
import { useEffect, useState } from "react";
import type { ReviewDef } from "../shared/types";
import { calculateFees } from "../../../shared/fees";
import { etsySearchUrl } from "../../../shared/pricing";
import { formatGBP, pounds, toPence } from "../../lib/format";
import { Icon } from "../../components/Icon";

interface Out {
  title: string;
  ourPricePence: number;
  medianPricePence: number;
  lowPricePence: number;
  percentAbove: number;
  suggestedPricePence: number;
  basedOn: string;
  url?: string;
  searchQuery: string;
}

export const priceWatchReview: ReviewDef = {
  approveLabel: "I've updated the price on Etsy",
  rejectLabel: "Ignore this time",
  startsReady: true,
  Body: ({ task, settings, setData }) => {
    const o = task.output as unknown as Out;
    const [text, setText] = useState(pounds(o.suggestedPricePence));
    const price = toPence(text);
    useEffect(() => setData(price >= 20 ? { pricePence: price } : {}), [price, setData]);
    const now = calculateFees({ pricePence: o.ourPricePence, costPence: 10 }, settings.fees);
    const next = calculateFees({ pricePence: price, costPence: 10 }, settings.fees);
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          <div className="flex items-start gap-2 font-semibold">
            <Icon name="alert" size={15} className="mt-0.5 shrink-0" />
            “{o.title}” is {o.percentAbove}% above similar listings
          </div>
          <div className="mt-1 pl-[23px] text-sm opacity-90">Based on {o.basedOn}. Buyers comparing will likely pick something cheaper.</div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-zinc-200 p-3 text-left dark:border-white/10">
            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Your price now</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">{formatGBP(o.ourPricePence)}</div>
            <div className="mt-0.5 text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">keep {formatGBP(now.netPence)}</div>
          </div>
          <div className="rounded-lg border border-zinc-200 p-3 text-left dark:border-white/10">
            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Market median</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">{formatGBP(o.medianPricePence)}</div>
            <div className="mt-0.5 text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">cheaper quarter {formatGBP(o.lowPricePence)}</div>
          </div>
          <label className="rounded-lg border border-indigo-300 bg-white p-3 text-left focus-within:ring-2 focus-within:ring-indigo-500/20 dark:border-indigo-500/40 dark:bg-night-3">
            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">New price (£)</div>
            <input className="mt-1 w-full bg-transparent text-lg font-semibold tabular-nums outline-none" inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} aria-label="New price in pounds" />
            <div className="mt-0.5 text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">keep {formatGBP(next.netPence)}</div>
          </label>
        </div>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          Pricer suggests <b>{formatGBP(o.suggestedPricePence)}</b>: {settings.radar.undercutPercent}% under the median, still above your {formatGBP(settings.minProfitPence)} minimum
          profit. Change it on Etsy, then tap “I've updated the price on Etsy” so BinkSuite remembers.
        </p>
        <div className="flex flex-wrap gap-2">
          {o.url && (
            <a className="btn-primary" href={o.url} target="_blank" rel="noreferrer">
              Open my listing on Etsy <Icon name="external" size={14} />
            </a>
          )}
          <a className="btn-soft" href={etsySearchUrl(o.searchQuery)} target="_blank" rel="noreferrer">
            See the competition
          </a>
        </div>
      </div>
    );
  },
};
