// 📡 Trend Radar + 🎯 Today's ideas, at the top of the Research Lab.
import { useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useUi } from "../../lib/store";
import { formatGBP, timeAgo } from "../../lib/format";
import { ErrorNote, ProgressBar, Section } from "../../components/ui";
import { etsySearchUrl } from "../../../shared/pricing";
import { undercutPrice } from "../../../shared/market";
import { minimumPriceFor } from "../../../shared/fees";
import type { Settings } from "../../../shared/settings";

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
}

interface RadarResp {
  etsyConnected: boolean;
  aiReady: boolean;
  error: { at: string; message: string } | null;
  watching: number;
  scannedLive: number;
  niches: Niche[];
  daily: { date: string; at: string; items: { productId: string; keyword: string; idea: string; angle: string; stage: string; verdict: string | null; overall: number | null }[] } | null;
  settings: Settings["radar"];
}

const VERDICT = { go: "✅", maybe: "🤔", skip: "⛔" } as Record<string, string>;

export function TrendRadar({ settings }: { settings: Settings }) {
  const qc = useQueryClient();
  const toast = useUi((s) => s.toast);
  const { data } = useQuery({ queryKey: ["radar"], queryFn: () => api.get<RadarResp>("/radar"), refetchInterval: 15_000 });
  const [newNiche, setNewNiche] = useState("");
  const refresh = () => qc.invalidateQueries();
  const scan = useMutation({ mutationFn: () => api.post<{ scanned: number; error: string | null }>("/radar/scan"), onSuccess: (r) => (toast({ icon: "📡", title: `Scanned ${r.scanned} niches`, body: r.error }), refresh()) });
  const daily = useMutation({ mutationFn: () => api.post<{ items: unknown[] }>("/radar/daily"), onSuccess: (r) => (toast({ icon: "🎯", title: `${r.items.length} new ideas sent to Scout` }), refresh()) });
  const research = useMutation({ mutationFn: (keyword: string) => api.post("/radar/research", { keyword }), onSuccess: () => (toast({ icon: "🔬", title: "Sent to Scout" }), refresh()) });
  const watch = useMutation({ mutationFn: () => api.post("/radar/niches", { keyword: newNiche }), onSuccess: () => (setNewNiche(""), refresh()) });

  if (!data) return null;
  const floor = minimumPriceFor(settings.minProfitPence, 10, settings.fees);
  const live = data.etsyConnected;

  return (
    <Section
      title="Trend Radar"
      icon="📡"
      right={
        <span className={`chip ${live ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200" : "bg-honey/25"}`}>
          {live ? `🟢 Live Etsy data · ${data.scannedLive}/${data.watching} niches read` : "🟡 AI estimates: add your Etsy key for live data"}
        </span>
      }
    >
      {!live && (
        <p className="mb-3 rounded-xl bg-honey/15 p-2 text-sm">
          Right now the radar runs on AI guesses. Add your Etsy API key in{" "}
          <Link to="/settings" className="font-bold underline">
            Settings → Etsy &amp; Trend Radar
          </Link>{" "}
          and it switches to real Etsy listings: prices, competition and how fast new listings are getting favourites.
        </p>
      )}
      {data.error && <p className="mb-3 rounded-xl bg-berry/10 p-2 text-sm font-semibold text-berry">⚠️ {data.error.message}</p>}

      {/* 🎯 Today's ideas */}
      <div className="mb-4 rounded-2xl bg-amber-50 p-3 dark:bg-amber-900/15">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-black">🎯 Today's ideas</h4>
          <div className="flex items-center gap-2 text-xs text-cocoa dark:text-stone-400">
            {settings.radar.autoDaily ? `Arrive each morning · ${settings.radar.dailyIdeas} a day` : "Auto off"}
            <button className="btn-soft !py-1 text-xs" onClick={() => daily.mutate()} disabled={daily.isPending || !data.aiReady}>
              {daily.isPending ? "Thinking…" : data.daily ? "➕ More ideas now" : "🎯 Get today's ideas now"}
            </button>
          </div>
        </div>
        {data.daily?.items.length ? (
          <ul className="space-y-1.5">
            {data.daily.items.map((i) => (
              <li key={i.productId} className="flex items-start gap-2 rounded-xl bg-white p-2 text-sm dark:bg-night-3">
                <span className="text-lg">{i.verdict ? VERDICT[i.verdict] : "🔎"}</span>
                <span className="min-w-0 flex-1">
                  <b>{i.idea}</b>
                  <span className="block text-xs text-cocoa dark:text-stone-400">
                    📡 {i.keyword} · {i.angle}
                  </span>
                </span>
                <span className="chip shrink-0">{i.verdict ? `${i.verdict.toUpperCase()} ${i.overall}` : i.stage === "research" ? "Scout's on it" : i.stage}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-cocoa dark:text-stone-400">No ideas yet today. They arrive each morning, or tap the button.</p>
        )}
      </div>

      {/* Trending niches */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-black">🔥 Trending now</h4>
        <button className="btn-soft !py-1 text-xs" onClick={() => scan.mutate()} disabled={scan.isPending}>
          {scan.isPending ? "Scanning…" : "📡 Scan now"}
        </button>
      </div>
      {data.niches.length === 0 ? (
        <p className="text-sm text-cocoa dark:text-stone-400">Nothing scored yet. Tap Scan now, or wait a few minutes.</p>
      ) : (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead className="text-left text-[11px] uppercase text-cocoa dark:text-stone-400">
              <tr>
                <th className="px-1 py-1">Niche</th>
                <th className="px-1">Heat</th>
                <th className="px-1">Momentum</th>
                <th className="px-1">Competitors</th>
                <th className="px-1">Median</th>
                <th className="px-1">Undercut at</th>
                <th className="px-1" />
              </tr>
            </thead>
            <tbody>
              {data.niches.map((n) => (
                <tr key={n.keyword} className="border-t border-black/5 dark:border-white/5">
                  <td className="px-1 py-1.5">
                    <a href={etsySearchUrl(n.keyword)} target="_blank" rel="noreferrer" className="font-bold hover:underline">
                      {n.keyword}
                    </a>
                    <span className="block text-[11px] text-cocoa dark:text-stone-400">
                      {n.source === "ai" ? "🤖 AI estimate" : `🟢 ${n.lastScanned ? timeAgo(n.lastScanned) : ""}`}
                      {n.origin === "you" ? " · yours" : ""}
                      {n.lastSuggested ? " · tried" : ""}
                    </span>
                  </td>
                  <td className="w-24 px-1">
                    <ProgressBar value={n.score / 100} color={n.score > 60 ? "#e0607e" : n.score > 35 ? "#f2b35b" : "#7c9cf5"} label={`${n.keyword} heat`} />
                    <span className="text-[11px] font-bold">{n.score}</span>
                  </td>
                  <td className="px-1 tabular-nums">{n.favsPerDay != null ? `${n.favsPerDay} ♥/day` : "—"}</td>
                  <td className="px-1 tabular-nums">{n.totalListings != null ? n.totalListings.toLocaleString() : "—"}</td>
                  <td className="px-1 tabular-nums">{n.medianPricePence ? formatGBP(n.medianPricePence) : "—"}</td>
                  <td className="px-1 font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                    {n.medianPricePence ? formatGBP(undercutPrice(n.medianPricePence, settings.radar.undercutPercent, floor)) : "—"}
                  </td>
                  <td className="px-1 text-right">
                    <button className="btn-good !px-2 !py-1 text-xs" onClick={() => research.mutate(n.keyword)} disabled={research.isPending}>
                      🔬 Research
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-cocoa dark:text-stone-400">
        <b>Heat</b> = how fast brand-new listings are collecting favourites, against how crowded the niche is. Etsy doesn't share sales numbers with anyone, so this is
        the best live signal. <b>Undercut at</b> = {settings.radar.undercutPercent}% below the median, never below your {formatGBP(settings.minProfitPence)} minimum profit.
      </p>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          watch.mutate();
        }}
      >
        <input className="input" value={newNiche} onChange={(e) => setNewNiche(e.target.value)} placeholder={`Watch a niche (${data.watching} watched), e.g. axolotl nursery art`} aria-label="Niche to watch" />
        <button className="btn-primary shrink-0" disabled={newNiche.trim().length < 3 || watch.isPending}>
          + Watch
        </button>
      </form>
      <ErrorNote error={scan.error ?? daily.error ?? research.error ?? watch.error} />
    </Section>
  );
}
