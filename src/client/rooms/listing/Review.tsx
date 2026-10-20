// Pricer's suggestion, side by side with similar products' prices, so you make the call.
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReviewDef } from "../shared/types";
import { calculateFees } from "../../../shared/fees";
import { etsySearchUrl, percentVsAverage, priceStats, type CompetitorPrice, type SimilarListing } from "../../../shared/pricing";
import { formatGBP, pounds, toPence } from "../../lib/format";
import { api } from "../../lib/api";
import { ErrorNote } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { savingPercent } from "../../../shared/bundle";

interface Out {
  pricePence: number;
  floorPence: number;
  netPence: number;
  feesPence: number;
  minProfitPence: number;
  marketRangePence?: [number, number] | null;
  searchQuery?: string;
  marketSource?: string | null;
  /** Similar products on Etsy right now (official API). */
  similar?: SimilarListing[];
  /** Bundles: what the products cost bought one by one. */
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
  approveLabel: "Approve price → Compliance",
  rejectLabel: "Re-price",
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
        <div className="grid grid-cols-3 gap-2">
          <label className="rounded-lg border border-indigo-300 bg-white p-3 text-left focus-within:ring-2 focus-within:ring-indigo-500/20 dark:border-indigo-500/40 dark:bg-night-3">
            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Your price (£)</div>
            <input
              className="mt-1 w-full bg-transparent text-lg font-semibold tabular-nums outline-none"
              inputMode="decimal"
              value={priceText}
              onChange={(e) => setPriceText(e.target.value)}
              aria-label="Your price in pounds"
            />
          </label>
          <div className="rounded-lg border border-zinc-200 p-3 text-left dark:border-white/10">
            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Etsy fees</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">{formatGBP(fees.totalFeesPence)}</div>
          </div>
          <div className="rounded-lg border border-zinc-200 p-3 text-left dark:border-white/10">
            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">You keep</div>
            <div className={`mt-1 text-lg font-semibold tabular-nums ${belowFloor ? "text-rose-600 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-400"}`}>{formatGBP(fees.netPence)}</div>
          </div>
        </div>
        {belowFloor && (
          <p className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
            <Icon name="alert" size={15} className="mt-0.5 shrink-0" />
            Below your {formatGBP(o.minProfitPence)} minimum profit. Lowest price that clears it: {formatGBP(o.floorPence)}.
          </p>
        )}
        {price !== o.pricePence && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Pricer suggested {formatGBP(o.pricePence)}.{" "}
            <button className="font-medium text-accent underline dark:text-indigo-300" onClick={() => setPriceText(pounds(o.pricePence))}>
              Use that
            </button>
          </p>
        )}

        {o.separatePence ? (
          <div className={`rounded-lg border p-3 text-sm ${price < o.separatePence ? "border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-white/[0.03]" : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"}`}>
            <div className="font-semibold">Bundle of {o.items?.length ?? 0}</div>
            <ul className="my-2 space-y-0.5 text-xs text-zinc-600 dark:text-zinc-400">
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
              <p className="flex items-start gap-2 font-medium">
                <Icon name="alert" size={15} className="mt-0.5 shrink-0" />
                A bundle has to cost less than {formatGBP(o.separatePence)} (the products bought separately).</p>
            )}
          </div>
        ) : null}

        {!o.separatePence && !!o.similar?.length && <Similar list={o.similar} yourPence={price} query={o.searchQuery ?? task.productTitle} onPick={(p) => setPriceText(pounds(p))} />}
        {o.marketSource && <p className="text-xs text-zinc-500 dark:text-zinc-400">Pricer's suggestion is based on {o.marketSource}, {Math.round(settings.radar.undercutPercent)}% under their middle price (never below your minimum profit).</p>}

        {!o.separatePence && task.productId && <Competitors productId={task.productId} yourPence={price} searchQuery={o.searchQuery ?? task.productTitle} fallbackRange={o.marketRangePence ?? null} onPick={(p) => setPriceText(pounds(p))} />}

        <details className="text-sm">
          <summary className="cursor-pointer font-medium text-zinc-700 dark:text-zinc-300">Fee breakdown</summary>
          <ul className="mt-2 divide-y divide-zinc-100 rounded-lg border border-zinc-200 text-zinc-700 dark:divide-white/[0.06] dark:border-white/10 dark:text-zinc-300">
            {fees.lines.map((l) => (
              <li key={l.key} className="flex justify-between px-3 py-1.5">
                <span>{l.label}</span>
                <span className="tabular-nums">{formatGBP(l.pence)}</span>
              </li>
            ))}
            <li className="flex justify-between px-3 py-1.5">
              <span>VAT on fees</span>
              <span className="tabular-nums">{formatGBP(fees.vatPence)}</span>
            </li>
            <li className="flex justify-between px-3 py-1.5">
              <span>AI cost (estimate)</span>
              <span className="tabular-nums">{formatGBP(fees.costPence)}</span>
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
    <div className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">Similar products on Etsy</h4>
        <a className="btn-soft px-2.5 py-1 text-xs" href={etsySearchUrl(query)} target="_blank" rel="noreferrer">
          Look on Etsy: “{query}” <Icon name="external" size={12} />
        </a>
      </div>

      {stats ? (
        <>
          <div className="grid grid-cols-4 gap-1.5">
            {(
              [
                ["Average", stats.averagePence],
                ["Median", stats.medianPence],
                ["Lowest", stats.minPence],
                ["Highest", stats.maxPence],
              ] as const
            ).map(([label, p]) => (
              <button key={label} className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-left transition hover:border-indigo-300 dark:border-white/10 dark:bg-night-3 dark:hover:border-indigo-500/40" onClick={() => onPick(p)} title={`Use ${formatGBP(p)}`}>
                <div className="text-[10px] font-semibold tracking-[0.06em] text-zinc-500 uppercase dark:text-zinc-400">{label}</div>
                <div className="text-sm font-semibold tabular-nums">{formatGBP(p)}</div>
              </button>
            ))}
          </div>
          <div>
            <div className="relative h-8">
              <div className="absolute inset-x-0 top-3.5 h-1.5 rounded-full bg-zinc-200 dark:bg-white/15" />
              {competitors.map((c, i) => (
                <span key={i} className="absolute top-3 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-zinc-400 ring-2 ring-white dark:bg-zinc-500 dark:ring-night-2" style={{ left: pos(c.pricePence) }} title={formatGBP(c.pricePence)} />
              ))}
              <span className="absolute top-0 -translate-x-1/2 text-center" style={{ left: pos(yourPence) }}>
                <span className="block rounded-md bg-accent px-1.5 text-[10px] font-semibold text-white dark:bg-indigo-500">You</span>
              </span>
            </div>
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              Your {formatGBP(yourPence)} is{" "}
              {diff === 0 ? "right on the average" : <b>{Math.abs(diff)}% {diff < 0 ? "below" : "above"}</b>}
              {diff === 0 ? "" : " the average"} of {stats.count} listing{stats.count === 1 ? "" : "s"} you checked.
            </p>
          </div>
        </>
      ) : (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Open Etsy, look at 5–10 similar listings, and jot their prices below. The app works out the average for you.</p>
      )}

      {range && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Scout's estimate: similar items sell for about <b>{formatGBP(range[0])}–{formatGBP(range[1])}</b> (an AI estimate, not live data).
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
            <li key={i} className="chip inline-flex items-center gap-1.5 bg-white py-1 dark:bg-night-3">
              <span className="font-medium tabular-nums">{formatGBP(c.pricePence)}</span>
              {c.note && <span className="max-w-[160px] truncate text-zinc-500 dark:text-zinc-400">{c.note}</span>}
              <button className="ml-0.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200" onClick={() => update(competitors.filter((_, j) => j !== i))} aria-label={`Remove ${formatGBP(c.pricePence)}`}>
                <Icon name="close" size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <ErrorNote error={save.error} />
    </div>
  );
}

/** What products like this sell for on Etsy right now, read by the Pricer (official API). */
function Similar({ list, yourPence, query, onPick }: { list: SimilarListing[]; yourPence: number; query: string; onPick: (pence: number) => void }) {
  const stats = priceStats(list.map((s) => s.pricePence))!;
  const diff = percentVsAverage(yourPence, stats);
  return (
    <div className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">Similar products on Etsy right now</h4>
        <a className="btn-soft px-2.5 py-1 text-xs" href={etsySearchUrl(query)} target="_blank" rel="noreferrer">
          See the search on Etsy <Icon name="external" size={12} />
        </a>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {(
          [
            ["Average", stats.averagePence],
            ["Middle", stats.medianPence],
            ["Lowest", stats.minPence],
            ["Highest", stats.maxPence],
          ] as const
        ).map(([label, p]) => (
          <button key={label} className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-left transition hover:border-indigo-300 dark:border-white/10 dark:bg-night-3 dark:hover:border-indigo-500/40" onClick={() => onPick(p)} title={`Use ${formatGBP(p)}`}>
            <div className="text-[10px] font-semibold tracking-[0.06em] text-zinc-500 uppercase dark:text-zinc-400">{label}</div>
            <div className="text-sm font-semibold tabular-nums">{formatGBP(p)}</div>
          </button>
        ))}
      </div>
      <p className="text-sm text-zinc-700 dark:text-zinc-300">
        Your {formatGBP(yourPence)} is {diff === 0 ? "right on the average" : <b>{Math.abs(diff)}% {diff < 0 ? "below" : "above"}</b>}
        {diff === 0 ? "" : " the average"} of these {stats.count}.
      </p>
      <ol className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white text-sm dark:divide-white/[0.06] dark:border-white/10 dark:bg-night-3">
        {list.map((s, i) => (
          <li key={s.url + i} className="flex items-center gap-3 px-3 py-1.5">
            <span className="w-5 shrink-0 text-xs text-zinc-400 tabular-nums">{i + 1}</span>
            <a className="min-w-0 flex-1 truncate hover:underline" href={s.url} target="_blank" rel="noreferrer" title={s.title}>
              {s.title}
            </a>
            <span className="shrink-0 text-xs text-zinc-500 tabular-nums dark:text-zinc-400" title="Favourites">
              {s.favourites.toLocaleString("en-GB")} fav
            </span>
            <button className="shrink-0 font-semibold tabular-nums hover:text-accent hover:underline dark:hover:text-indigo-300" onClick={() => onPick(s.pricePence)} title="Use this price">
              {formatGBP(s.pricePence)}
            </button>
          </li>
        ))}
      </ol>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">Tap a price to use it. Prices are converted to pounds; one listing per shop.</p>
    </div>
  );
}
