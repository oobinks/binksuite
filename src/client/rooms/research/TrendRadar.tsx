// Trend Radar + today's ideas, at the top of the Research Lab.
import { useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useUi } from "../../lib/store";
import { formatGBP, plain, timeAgo } from "../../lib/format";
import { Icon } from "../../components/Icon";
import { ErrorNote, ProgressBar, Section } from "../../components/ui";
import { etsySearchUrl } from "../../../shared/pricing";
import { undercutPrice } from "../../../shared/market";
import { minimumPriceFor } from "../../../shared/fees";
import type { Settings } from "../../../shared/settings";
import type { ProductFormat } from "../../../shared/format";
import { FormatBadge } from "../../components/FormatBadge";

interface Niche {
  keyword: string;
  category: string;
  origin: string;
  source: "etsy" | "ai" | null;
  lastScanned: string | null;
  totalListings: number | null;
  medianPricePence: number | null;
  lowPricePence: number | null;
  favsPerDay: number | null;
  newListings30d: number | null;
  score: number;
  note: string | null;
  lastSuggested: string | null;
  format: ProductFormat;
}

interface RadarResp {
  etsyConnected: boolean;
  aiReady: boolean;
  error: { at: string; message: string } | null;
  watching: number;
  scannedLive: number;
  niches: Niche[];
  daily: {
    date: string;
    at: string;
    pickedId?: string;
    items: {
      id?: string;
      productId?: string;
      keyword: string;
      idea: string;
      angle: string;
      why?: string;
      score?: number;
      market?: { totalListings: number | null; medianPricePence: number | null; favsPerDay: number | null } | null;
      format?: ProductFormat;
      stage: string | null;
      verdict: string | null;
      overall: number | null;
    }[];
  } | null;
  settings: Settings["radar"];
}

const VERDICT: Record<string, { label: string; dot: string }> = {
  go: { label: "Go", dot: "bg-emerald-500" },
  maybe: { label: "Maybe", dot: "bg-amber-500" },
  skip: { label: "Skip", dot: "bg-rose-500" },
};

function Dot({ className }: { className: string }) {
  return <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${className}`} aria-hidden />;
}

export function TrendRadar({ settings }: { settings: Settings }) {
  const qc = useQueryClient();
  const toast = useUi((s) => s.toast);
  const { data } = useQuery({ queryKey: ["radar"], queryFn: () => api.get<RadarResp>("/radar"), refetchInterval: 15_000 });
  const [newNiche, setNewNiche] = useState("");
  const refresh = () => qc.invalidateQueries();
  const scan = useMutation({ mutationFn: () => api.post<{ scanned: number; error: string | null }>("/radar/scan"), onSuccess: (r) => (toast({ icon: "", title: `Scanned ${r.scanned} niches`, body: r.error }), refresh()) });
  const daily = useMutation({
    mutationFn: (refresh: boolean) => api.post<{ items: unknown[]; pending?: boolean }>("/radar/daily", { refresh }),
    onSuccess: (r) => (toast(r.pending ? { icon: "", title: "Added to Claude's to-do list", body: "Today's ideas arrive when Claude's session finishes." } : { icon: "", title: `Today's ${r.items.length} best ideas are ready`, body: "Pick the one to make today." }), refresh()),
  });
  const pick = useMutation({
    mutationFn: async (id: string) => {
      try {
        return await api.post<{ productId: string }>("/radar/daily/pick", { id });
      } catch (e) {
        // Already picked today's product: make another one only if you mean it.
        if ((e as { status?: number }).status === 409 && confirm("You've already picked today's product. Make this one too?")) return api.post<{ productId: string }>("/radar/daily/pick", { id, force: true });
        if ((e as { status?: number }).status === 409) return null;
        throw e;
      }
    },
    onSuccess: (r) => {
      if (r) toast({ icon: "", title: "Sent to the task board", body: "Scout is researching it. Find it on the Research task board." });
      refresh();
    },
  });
  const [sent, setSent] = useState<Set<string>>(new Set());
  const research = useMutation({
    mutationFn: (keyword: string) => api.post("/radar/research", { keyword }),
    onSuccess: (_r, keyword) => (setSent((s) => new Set(s).add(keyword)), toast({ icon: "", title: "Sent to the task board", body: `Scout is researching “${keyword}”.` }), refresh()),
  });
  const watch = useMutation({ mutationFn: () => api.post("/radar/niches", { keyword: newNiche }), onSuccess: () => (setNewNiche(""), refresh()) });

  if (!data) return null;
  const floor = minimumPriceFor(settings.minProfitPence, 10, settings.fees);
  const live = data.etsyConnected;
  // Niches where your minimum profit stops you undercutting the median properly.
  const squeezed = data.niches.filter((n) => n.medianPricePence && undercutPrice(n.medianPricePence, settings.radar.undercutPercent, floor) === floor).length;

  const th = "px-3 py-2 text-[11px] font-semibold tracking-[0.06em] text-zinc-500 uppercase dark:text-zinc-400";
  const muted = "text-zinc-500 dark:text-zinc-400";

  return (
    <Section
      title="Trend Radar"
      right={
        <span className="chip gap-1.5">
          <Dot className={live ? "bg-emerald-500" : "bg-amber-500"} />
          {live
            ? data.scannedLive
              ? `Live Etsy data · ${data.scannedLive}/${data.watching} niches read`
              : "Etsy connected · first scan starting, or tap Scan now"
            : "AI estimates: add your Etsy key for live data"}
        </span>
      }
    >
      {!live && (
        <p className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-900 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-100">
          Right now the radar runs on AI guesses. Add your Etsy API key in{" "}
          <Link to="/settings" className="font-medium underline">
            Settings → Etsy &amp; Trend Radar
          </Link>{" "}
          and it switches to real Etsy listings: prices, competition and how fast new listings are getting favourites.
        </p>
      )}
      {data.error && (
        <p className="mb-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
          <Icon name="alert" size={15} className="mt-0.5 shrink-0" />
          {data.error.message}
        </p>
      )}

      {/* Today's ideas */}
      <div className="mb-6">
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-semibold">Today's ideas</h4>
          <div className={`flex items-center gap-3 text-xs ${muted}`}>
            {settings.radar.autoDaily ? `Best ${settings.radar.dailyIdeas} each morning · send the one you want to the task board` : "Auto off"}
            {!data.daily?.pickedId && (
              <button className="btn-soft inline-flex items-center gap-1.5 !px-2.5 !py-1 text-xs" onClick={() => daily.mutate(!!data.daily?.items.length)} disabled={daily.isPending || !data.aiReady}>
                {data.daily?.items.length ? <Icon name="refresh" size={13} /> : <Icon name="sparkles" size={13} />}
                {daily.isPending ? "Thinking…" : data.daily?.items.length ? "Fresh ideas" : "Get today's ideas now"}
              </button>
            )}
          </div>
        </div>
        {data.daily?.items.length ? (
          <ul className="divide-y divide-zinc-100 overflow-hidden rounded-lg border border-zinc-200 dark:divide-white/[0.06] dark:border-white/10">
            {data.daily.items.map((i, n) => {
              const picked = !!i.productId;
              const isToday = data.daily!.pickedId ? i.id === data.daily!.pickedId : false;
              const v = i.verdict ? VERDICT[i.verdict] : undefined;
              return (
                <li key={i.id ?? i.productId ?? n} className={`flex items-start gap-3 px-3 py-3 text-sm ${isToday ? "bg-emerald-50/60 shadow-[inset_2px_0_0_#10b981] dark:bg-emerald-500/[0.06]" : "bg-white dark:bg-transparent"}`}>
                  <span
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-zinc-200 bg-zinc-50 text-sm font-semibold tabular-nums text-zinc-800 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-100"
                    title="Scout's score out of 10"
                  >
                    {i.score ?? (v ? <Dot className={v.dot} /> : <span className="text-zinc-400">–</span>)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <FormatBadge format={i.format ?? "art"} />
                      <span className="font-medium">{plain(i.idea)}</span>
                      {n === 0 && (
                        <span className="inline-flex items-center rounded-md border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300">Top pick</span>
                      )}
                    </div>
                    <div className={`mt-0.5 text-xs ${muted}`}>
                      {i.keyword} · {plain(i.angle)}
                    </div>
                    {i.why && <div className={`mt-0.5 text-xs ${muted}`}>{plain(i.why)}</div>}
                    {i.market && (
                      <div className="mt-1 text-[11px] text-zinc-400 tabular-nums dark:text-zinc-500">
                        {i.market.totalListings != null && `${i.market.totalListings.toLocaleString("en-GB")} competitors`}
                        {i.market.medianPricePence ? ` · usually ${formatGBP(i.market.medianPricePence)}` : ""}
                        {i.market.favsPerDay != null ? ` · ${i.market.favsPerDay} favs/day on new listings` : ""}
                      </div>
                    )}
                  </div>
                  {picked ? (
                    <span className="chip shrink-0 gap-1.5">
                      {v ? (
                        <>
                          <Dot className={v.dot} />
                          {v.label} <span className="tabular-nums">{i.overall}</span>
                        </>
                      ) : i.stage === "research" ? (
                        <>
                          <Dot className="bg-indigo-500 anim-glow" />
                          Researching
                        </>
                      ) : (
                        (i.stage ?? "Started")
                      )}
                    </span>
                  ) : data.daily!.pickedId ? (
                    <button className={`shrink-0 text-xs underline-offset-2 hover:underline ${muted}`} onClick={() => pick.mutate(i.id!)} disabled={pick.isPending || !i.id}>
                      Send this too
                    </button>
                  ) : (
                    <button className={`${n === 0 ? "btn-primary" : "btn-soft"} shrink-0 !px-2.5 !py-1 text-xs`} onClick={() => pick.mutate(i.id!)} disabled={pick.isPending || !i.id}>
                      <Icon name="arrowRight" size={13} />
                      Send to task board
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={`rounded-lg border border-dashed border-zinc-200 px-3 py-6 text-center text-sm dark:border-white/10 ${muted}`}>
            No ideas yet today. The best {settings.radar.dailyIdeas} arrive each morning, or tap the button.
          </p>
        )}
        {data.daily?.pickedId && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300">
            <Icon name="check" size={13} /> Today's product is picked. Fresh ideas arrive tomorrow morning.
          </p>
        )}
      </div>

      {/* Trending niches */}
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">Trending now</h4>
        <button className="btn-soft inline-flex items-center gap-1.5 !px-2.5 !py-1 text-xs" onClick={() => scan.mutate()} disabled={scan.isPending}>
          <Icon name="refresh" size={13} />
          {scan.isPending ? "Scanning…" : "Scan now"}
        </button>
      </div>
      {data.niches.length === 0 ? (
        <p className={`rounded-lg border border-dashed border-zinc-200 px-3 py-6 text-center text-sm dark:border-white/10 ${muted}`}>Nothing scored yet. Tap Scan now, or wait a few minutes.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-white/10">
          <table className="w-full min-w-[660px] text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-left dark:border-white/10 dark:bg-white/[0.03]">
              <tr>
                <th className={th}>Niche</th>
                <th className={th}>Heat</th>
                <th className={`${th} text-right`}>Momentum</th>
                <th className={`${th} text-right`}>Competitors</th>
                <th className={`${th} text-right`}>Median</th>
                <th className={th}>Undercut at</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
              {data.niches.map((n) => (
                <tr key={n.keyword} className="transition-colors hover:bg-zinc-50/70 dark:hover:bg-white/[0.02]">
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <a href={etsySearchUrl(n.keyword)} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                        {n.keyword}
                      </a>
                      <FormatBadge format={n.format} />
                    </div>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                      <Dot className={n.source === "ai" ? "bg-zinc-400" : "bg-emerald-500"} />
                      {n.source === "ai" ? "AI estimate" : n.lastScanned ? timeAgo(n.lastScanned) : "Live"}
                      {n.origin === "you" ? " · yours" : ""}
                      {n.lastSuggested ? " · sent before" : ""}
                    </span>
                  </td>
                  <td className="w-32 px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <ProgressBar value={n.score / 100} color={n.score > 60 ? "#e11d48" : n.score > 35 ? "#f59e0b" : "#4f46e5"} className="flex-1" label={`${n.keyword} heat`} />
                      <span className="w-6 text-right text-xs font-medium tabular-nums">{n.score}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{n.favsPerDay != null ? `${n.favsPerDay}/day` : <span className="text-zinc-400">—</span>}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{n.totalListings != null ? n.totalListings.toLocaleString() : <span className="text-zinc-400">—</span>}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{n.medianPricePence ? formatGBP(n.medianPricePence) : <span className="text-zinc-400">—</span>}</td>
                  <UndercutCell medianPence={n.medianPricePence} undercutPercent={settings.radar.undercutPercent} floorPence={floor} />
                  <td className="px-3 py-2.5 text-right">
                    {sent.has(n.keyword) ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                        <Icon name="check" size={13} />
                        On the board
                      </span>
                    ) : (
                      <button className="btn-soft !px-2.5 !py-1 text-xs" onClick={() => research.mutate(n.keyword)} disabled={research.isPending && research.variables === n.keyword}>
                        <Icon name="arrowRight" size={13} />
                        {research.isPending && research.variables === n.keyword ? "Sending…" : "Send to task board"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className={`mt-2.5 text-xs leading-relaxed ${muted}`}>
        <span className="font-medium text-zinc-700 dark:text-zinc-300">Heat</span> = how fast brand-new listings are collecting favourites, against how crowded the niche is. Momentum is favourites per day on new listings. Etsy doesn't share sales numbers with anyone, so this is
        the best live signal. <span className="font-medium text-zinc-700 dark:text-zinc-300">Undercut at</span> = {settings.radar.undercutPercent}% below the median, never below {formatGBP(floor)} (the lowest price that still
        leaves your {formatGBP(settings.minProfitPence)} minimum profit).
      </p>
      {squeezed > 0 && (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          <Icon name="alert" size={14} className="mt-px shrink-0" />
          <span>
            In <b className="font-semibold">{squeezed}</b> of these niches your minimum profit stops a proper undercut (shown in amber). Today's ideas pick niches with room to undercut first. To
            compete harder on price, lower <b className="font-semibold">Minimum profit per sale</b> in{" "}
            <Link to="/settings" className="font-medium underline">
              Settings
            </Link>
            .
          </span>
        </p>
      )}

      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          watch.mutate();
        }}
      >
        <input className="input" value={newNiche} onChange={(e) => setNewNiche(e.target.value)} placeholder={`Watch a niche (${data.watching} watched), e.g. axolotl nursery art`} aria-label="Niche to watch" />
        <button className="btn-primary shrink-0" disabled={newNiche.trim().length < 3 || watch.isPending}>
          Watch
        </button>
      </form>
      <ErrorNote error={scan.error ?? daily.error ?? pick.error ?? research.error ?? watch.error} />
    </Section>
  );
}


/** Green when we can undercut properly; amber when the profit floor holds the price at (or above) the market. */
function UndercutCell({ medianPence, undercutPercent, floorPence }: { medianPence: number | null; undercutPercent: number; floorPence: number }) {
  if (!medianPence) return <td className="px-3 py-2.5 text-zinc-400">—</td>;
  const price = undercutPrice(medianPence, undercutPercent, floorPence);
  if (price !== floorPence) return <td className="px-3 py-2.5 font-medium tabular-nums text-emerald-700 dark:text-emerald-300">{formatGBP(price)}</td>;
  const atOrAbove = price >= medianPence;
  return (
    <td className="px-3 py-2.5 tabular-nums text-amber-700 dark:text-amber-300" title={`Your minimum profit needs at least ${formatGBP(floorPence)}`}>
      <span className="font-medium">{formatGBP(price)}</span>
      <span className="flex items-center gap-1 text-[11px]">
        {atOrAbove && <Icon name="alert" size={11} />}
        {atOrAbove ? "Above market" : "Min profit"}
      </span>
    </td>
  );
}
