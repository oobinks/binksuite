// Pricer's suggestion, side by side with similar products' prices, so you make the call.
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReviewDef } from "../shared/types";
import { calculateFees } from "../../../shared/fees";
import { etsySearchUrl, percentVsAverage, priceStats, type CompetitorPrice } from "../../../shared/pricing";
import { formatGBP, pounds, toPence } from "../../lib/format";
import { api } from "../../lib/api";
import { ErrorNote } from "../../components/ui";
import { savingPercent } from "../../../shared/bundle";

interface Out {
  pricePence: number;
  floorPence: number;
  netPence: number;
  feesPence: number;
  minProfitPence: number;
  marketRangePence?: [number, number] | null;
  searchQuery?: string;
  /** 🎁 Bundles: what the products cost bought one by one. */
  separatePence?: number;
  items?: { title: string; pricePence: number }[];
}

interface ProductInfo {
  id: string;
  title: string;
  niche: string;
  competitors: CompetitorPrice[];
  marketRangePence: [number, number] | null;
  keywords: string[];
}

export const listingReview: ReviewDef = {
  approveLabel: "👍 Approve price → Compliance",
  rejectLabel: "🔁 Re-price",
  startsReady: true,
  Body: ({ task, settings, setData, setReady }) => {
    const o = task.output as unknown as Out;
    const [priceText, setPriceText] = useState(pounds(o.pricePence));
    const price = toPence(priceText);
    const fees = calculateFees({ pricePence: price, costPence: 10 }, settings.fees);
    const belowFloor = price < o.floorPence;

    useEffect(() => {
      setReady(price >= 20);
      setData(price !== o.pricePence && price >= 20 ? { pricePence: price } : {});
    }, [price, o.pricePence, setData, setReady]);

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <label className="rounded-xl bg-amber-100 p-2 dark:bg-amber-900/30">
            <div className="text-xs font-bold">Your price (£)</div>
            <input
              className="w-full bg-transparent text-center text-xl font-black outline-none"
              inputMode="decimal"
              value={priceText}
              onChange={(e) => setPriceText(e.target.value)}
              aria-label="Your price in pounds"
            />
          </label>
          <div className="rounded-xl bg-black/5 p-2 dark:bg-white/5">
            <div className="text-xs font-bold">Etsy fees</div>
            <div className="text-xl font-black">{formatGBP(fees.totalFeesPence)}</div>
          </div>
          <div className={`rounded-xl p-2 ${belowFloor ? "bg-rose-100 dark:bg-rose-900/30" : "bg-emerald-100 dark:bg-emerald-900/30"}`}>
            <div className="text-xs font-bold">You keep</div>
            <div className="text-xl font-black">{formatGBP(fees.netPence)}</div>
          </div>
        </div>
        {belowFloor && (
          <p className="rounded-xl bg-rose-50 p-2 text-sm font-semibold text-rose-700 dark:bg-rose-900/30 dark:text-rose-200">
            ⚠️ Below your {formatGBP(o.minProfitPence)} minimum profit. Lowest price that clears it: {formatGBP(o.floorPence)}.
          </p>
        )}
        {price !== o.pricePence && (
          <p className="text-xs text-cocoa dark:text-stone-400">
            Pricer suggested {formatGBP(o.pricePence)}.{" "}
            <button className="underline" onClick={() => setPriceText(pounds(o.pricePence))}>
              Use that
            </button>
          </p>
        )}

        {o.separatePence ? (
          <div className={`rounded-xl p-3 text-sm ${price < o.separatePence ? "bg-honey/20" : "bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-200"}`}>
            <div className="font-black">🎁 Bundle of {o.items?.length ?? 0}</div>
            <ul className="my-1 text-xs">
              {o.items?.map((i) => (
                <li key={i.title} className="flex justify-between">
                  <span className="truncate">{i.title}</span>
                  <span className="tabular-nums">{formatGBP(i.pricePence)}</span>
                </li>
              ))}
            </ul>
            {price < o.separatePence ? (
              <p>
                Separately {formatGBP(o.separatePence)} → bundle {formatGBP(price)}: buyers save <b>{savingPercent(o.separatePence, price)}%</b>. The listing will say so, worked out from the final price.
              </p>
            ) : (
              <p className="font-semibold">⚠️ A bundle has to cost less than {formatGBP(o.separatePence)} (the products bought separately).</p>
            )}
          </div>
        ) : null}

        {!o.separatePence && task.productId && <Competitors productId={task.productId} yourPence={price} searchQuery={o.searchQuery ?? task.productTitle} fallbackRange={o.marketRangePence ?? null} onPick={(p) => setPriceText(pounds(p))} />}

        <details className="text-sm">
          <summary className="cursor-pointer font-bold">Fee breakdown</summary>
          <ul className="mt-2 space-y-1">
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
        </details>
      </div>
    );
  },
};

function Competitors({
  productId,
  yourPence,
  searchQuery,
  fallbackRange,
  onPick,
}: {
  productId: string;
  yourPence: number;
  searchQuery: string;
  fallbackRange: [number, number] | null;
  onPick: (pence: number) => void;
}) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["product", productId], queryFn: () => api.get<ProductInfo>(`/products/${productId}`) });
  const [list, setList] = useState<CompetitorPrice[] | null>(null);
  const [newPrice, setNewPrice] = useState("");
  const [newNote, setNewNote] = useState("");
  const competitors = list ?? data?.competitors ?? [];
  const save = useMutation({
    mutationFn: (next: CompetitorPrice[]) => api.put<{ competitors: CompetitorPrice[] }>(`/products/${productId}/competitors`, { competitors: next }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["product", productId] }),
  });
  const update = (next: CompetitorPrice[]) => {
    setList(next);
    save.mutate(next);
  };
  const stats = useMemo(() => priceStats(competitors.map((c) => c.pricePence)), [competitors]);
  const range = data?.marketRangePence ?? fallbackRange;
  const query = data?.keywords[0] ?? searchQuery;

  const add = () => {
    const p = toPence(newPrice);
    if (p <= 0) return;
    update([...competitors, { pricePence: p, note: newNote.trim() || undefined }]);
    setNewPrice("");
    setNewNote("");
  };

  // Where your price sits on the min–max scale.
  const lo = stats ? Math.min(stats.minPence, yourPence) : 0;
  const hi = stats ? Math.max(stats.maxPence, yourPence) : 1;
  const pos = (p: number) => `${hi === lo ? 50 : ((p - lo) / (hi - lo)) * 100}%`;
  const diff = stats ? percentVsAverage(yourPence, stats) : 0;

  return (
    <div className="space-y-3 rounded-2xl bg-black/[0.03] p-3 dark:bg-white/[0.04]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-black">🏷️ Similar products on Etsy</h4>
        <a className="btn-soft !py-1 text-xs" href={etsySearchUrl(query)} target="_blank" rel="noreferrer">
          🔎 Look on Etsy: “{query}”
        </a>
      </div>

      {stats ? (
        <>
          <div className="grid grid-cols-4 gap-1.5 text-center">
            {(
              [
                ["Average", stats.averagePence],
                ["Median", stats.medianPence],
                ["Lowest", stats.minPence],
                ["Highest", stats.maxPence],
              ] as const
            ).map(([label, p]) => (
              <button key={label} className="rounded-xl bg-white p-1.5 hover:ring-2 hover:ring-honey dark:bg-night-3" onClick={() => onPick(p)} title={`Use ${formatGBP(p)}`}>
                <div className="text-[10px] font-bold uppercase text-cocoa dark:text-stone-400">{label}</div>
                <div className="font-black tabular-nums">{formatGBP(p)}</div>
              </button>
            ))}
          </div>
          <div>
            <div className="relative h-8">
              <div className="absolute inset-x-0 top-3.5 h-1.5 rounded-full bg-black/10 dark:bg-white/15" />
              {competitors.map((c, i) => (
                <span key={i} className="absolute top-3 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-cocoa/60" style={{ left: pos(c.pricePence) }} title={formatGBP(c.pricePence)} />
              ))}
              <span className="absolute top-0 -translate-x-1/2 text-center" style={{ left: pos(yourPence) }}>
                <span className="block rounded-full bg-honey px-1.5 text-[10px] font-black text-ink">You</span>
              </span>
            </div>
            <p className="text-sm font-semibold">
              Your {formatGBP(yourPence)} is{" "}
              {diff === 0 ? "right on the average" : <b>{Math.abs(diff)}% {diff < 0 ? "below" : "above"}</b>}
              {diff === 0 ? "" : " the average"} of {stats.count} listing{stats.count === 1 ? "" : "s"} you checked.
            </p>
          </div>
        </>
      ) : (
        <p className="text-sm text-cocoa dark:text-stone-400">Open Etsy, look at 5–10 similar listings, and jot their prices below. The app works out the average for you.</p>
      )}

      {range && (
        <p className="text-xs text-cocoa dark:text-stone-400">
          🔬 Scout's estimate: similar items sell for about <b>{formatGBP(range[0])}–{formatGBP(range[1])}</b> (an AI estimate, not live data).
        </p>
      )}

      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input className="input !w-24" inputMode="decimal" placeholder="£ price" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} aria-label="Competitor price" />
        <input className="input min-w-0 flex-1" placeholder="Note (optional): shop, set of 3, bestseller…" value={newNote} onChange={(e) => setNewNote(e.target.value)} aria-label="Note" maxLength={120} />
        <button className="btn-primary" disabled={toPence(newPrice) <= 0}>
          Add
        </button>
      </form>
      {competitors.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {competitors.map((c, i) => (
            <li key={i} className="chip bg-white py-1 dark:bg-night-3">
              <b>{formatGBP(c.pricePence)}</b>
              {c.note && <span className="max-w-[160px] truncate text-cocoa dark:text-stone-400">{c.note}</span>}
              <button className="ml-0.5 opacity-50 hover:opacity-100" onClick={() => update(competitors.filter((_, j) => j !== i))} aria-label={`Remove ${formatGBP(c.pricePence)}`}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <ErrorNote error={save.error} />
    </div>
  );
}
