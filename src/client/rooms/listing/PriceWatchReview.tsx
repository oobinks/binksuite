// 👀 Price Watch alert: one of your live listings is priced well above the market.
import { useEffect, useState } from "react";
import type { ReviewDef } from "../shared/types";
import { calculateFees } from "../../../shared/fees";
import { etsySearchUrl } from "../../../shared/pricing";
import { formatGBP, pounds, toPence } from "../../lib/format";

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
  approveLabel: "✅ I've updated the price on Etsy",
  rejectLabel: "🙈 Ignore this time",
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
        <div className="rounded-xl bg-rose-50 p-3 dark:bg-rose-900/25">
          <div className="font-black">👀 “{o.title}” is {o.percentAbove}% above similar listings</div>
          <div className="text-sm text-cocoa dark:text-stone-300">Based on {o.basedOn}. Buyers comparing will likely pick something cheaper.</div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-black/5 p-2 dark:bg-white/5">
            <div className="text-xs font-bold">Your price now</div>
            <div className="text-xl font-black">{formatGBP(o.ourPricePence)}</div>
            <div className="text-[11px]">keep {formatGBP(now.netPence)}</div>
          </div>
          <div className="rounded-xl bg-black/5 p-2 dark:bg-white/5">
            <div className="text-xs font-bold">Market median</div>
            <div className="text-xl font-black">{formatGBP(o.medianPricePence)}</div>
            <div className="text-[11px]">cheaper quarter {formatGBP(o.lowPricePence)}</div>
          </div>
          <label className="rounded-xl bg-emerald-100 p-2 dark:bg-emerald-900/30">
            <div className="text-xs font-bold">New price (£)</div>
            <input className="w-full bg-transparent text-center text-xl font-black outline-none" inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} aria-label="New price in pounds" />
            <div className="text-[11px]">keep {formatGBP(next.netPence)}</div>
          </label>
        </div>
        <p className="text-sm">
          Pricer suggests <b>{formatGBP(o.suggestedPricePence)}</b>: {settings.radar.undercutPercent}% under the median, still above your {formatGBP(settings.minProfitPence)} minimum
          profit. Change it on Etsy, then tap the green button so BinkSuite remembers.
        </p>
        <div className="flex flex-wrap gap-2">
          {o.url && (
            <a className="btn-primary" href={o.url} target="_blank" rel="noreferrer">
              ✏️ Open my listing on Etsy
            </a>
          )}
          <a className="btn-soft" href={etsySearchUrl(o.searchQuery)} target="_blank" rel="noreferrer">
            🔎 See the competition
          </a>
        </div>
      </div>
    );
  },
};
