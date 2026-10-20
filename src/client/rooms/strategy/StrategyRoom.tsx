// Strategy: the shop's numbers at a glance and Manager's weekly report with next steps.
import type { ReactNode } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useUi } from "../../lib/store";
import { formatGBP, plain, timeAgo } from "../../lib/format";
import { ErrorNote, Section, Spinner } from "../../components/ui";
import { Icon, type IconName } from "../../components/Icon";
import { ProfitChart } from "./ProfitChart";
import { ReportView, weekLabel } from "./ReportView";
import { FORMAT_NAME, type ReportsResp, type ShopNumbers, type StrategyReport } from "./types";

const FORMAT_BAR: Record<string, string> = { excel: "bg-emerald-500", pdf: "bg-sky-500", art: "bg-rose-500", unlinked: "bg-zinc-400" };

export function StrategyRoom() {
  const qc = useQueryClient();
  const toast = useUi((s) => s.toast);
  const numbers = useQuery({ queryKey: ["strategy-numbers"], queryFn: () => api.get<ShopNumbers>("/strategy/numbers"), refetchInterval: 60_000 });
  const reports = useQuery({
    queryKey: ["strategy-reports"],
    queryFn: () => api.get<ReportsResp>("/strategy/reports"),
    // While Claude is writing it, check every 15 seconds.
    refetchInterval: (q) => (q.state.data?.pending ? 15_000 : 120_000),
  });
  const write = useMutation({
    mutationFn: () => api.post<{ report: StrategyReport | null; pending?: boolean }>("/strategy/report"),
    onSuccess: (r) => {
      toast(r.pending ? { icon: "", title: "Added to Claude's to-do list", body: "The report appears here when Claude's session finishes." } : { icon: "", title: "This week's report is ready" });
      qc.invalidateQueries({ queryKey: ["strategy-reports"] });
      qc.invalidateQueries({ queryKey: ["strategy-numbers"] });
    },
  });

  const n = numbers.data;
  const r = reports.data;
  const latest = r?.reports[0];
  const past = r?.reports.slice(1) ?? [];

  return (
    <div className="space-y-6">
      <ErrorNote error={numbers.error} />
      {n ? <KpiRow n={n} /> : !numbers.error && <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>}

      <Section
        id="strategy-report"
        title={latest ? `Manager's report: ${weekLabel(latest).toLowerCase()}` : "Manager's weekly report"}
        right={
          r?.aiOn ? (
            <button className="btn-primary px-3 py-1.5 text-xs" onClick={() => write.mutate()} disabled={write.isPending || r.pending}>
              {write.isPending ? <Spinner /> : <Icon name="sparkles" size={13} />} {r.pending ? "Waiting for Claude…" : "Write this week's report now"}
            </button>
          ) : null
        }
      >
        <div className="space-y-4">
          <ErrorNote error={write.error ?? reports.error} />
          {r?.pending && (
            <p className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-900 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-100">
              Added to Claude's to-do list. The report appears here when Claude's session finishes.
            </p>
          )}
          {r && !r.aiOn && (
            <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-300">
              Manager writes a short report every Monday morning.{" "}
              <Link to="/settings" className="font-medium text-accent underline dark:text-indigo-300">
                Switch on real AI in Settings
              </Link>{" "}
              to get it. The numbers on this page work without AI.
            </p>
          )}
          {latest ? (
            <>
              <ReportView key={latest.id} report={latest} />
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Written {timeAgo(latest.at)}
                {latest.auto ? " (Monday's automatic report)" : ""}. Based only on the numbers recorded in BinkSuite.
              </p>
            </>
          ) : (
            r?.aiOn &&
            !r.pending && <p className="text-sm text-zinc-500 dark:text-zinc-400">No report yet. The first one arrives on Monday morning, or write it now.</p>
          )}
        </div>
      </Section>

      {n && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Section id="strategy-chart" title="Net profit by week">
            <ProfitChart weekly={n.weekly} />
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Last 8 weeks, Monday to Sunday. This week so far is on the right.</p>
          </Section>
          <Section id="strategy-formats" title="Sales by type (last 4 weeks)">
            <FormatBars p={n.month} />
          </Section>
          <Section id="strategy-best" title="Best sellers (last 4 weeks)">
            <BestSellers p={n.month} />
          </Section>
          <Section id="strategy-pipeline" title="Pipeline and listings">
            <Pipeline n={n} />
          </Section>
        </div>
      )}

      {past.length > 0 && (
        <Section id="strategy-past" title={`Past reports (${past.length})`}>
          <div className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
            {past.map((p) => (
              <details key={p.id} className="group py-2.5 first:pt-0 last:pb-0">
                <summary className="flex cursor-pointer list-none items-center gap-2 text-sm">
                  <Icon name="chevronRight" size={14} className="shrink-0 text-zinc-400 transition group-open:rotate-90" />
                  <span className="w-44 shrink-0 font-medium">{weekLabel(p)}</span>
                  <span className="min-w-0 truncate text-zinc-500 dark:text-zinc-400">{plain(p.headline)}</span>
                </summary>
                <div className="mt-3 pl-6">
                  <ReportView report={p} />
                </div>
              </details>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

// ───────────── KPI tiles (last 7 days vs the 7 before) ─────────────

function change(cur: number, prev: number): { text: string; tone: string } {
  if (cur === prev) return { text: "Same as the week before", tone: "text-zinc-500 dark:text-zinc-400" };
  const up = cur > prev;
  const tone = up ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";
  if (prev === 0) return { text: `${up ? "↑" : "↓"} from nothing the week before`, tone };
  const pct = Math.round((Math.abs(cur - prev) / Math.abs(prev)) * 100);
  return { text: `${up ? "↑" : "↓"} ${pct}% vs the week before`, tone };
}

function KpiRow({ n }: { n: ShopNumbers }) {
  const { week: w, prevWeek: p } = n;
  const exp = n.expiringSoon.length;
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      <Kpi icon="orders" tone="bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300" label="Sales, last 7 days" value={String(w.sales)} delta={change(w.sales, p.sales)} />
      <Kpi icon="finance" tone="bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300" label="Revenue, last 7 days" value={formatGBP(w.revenuePence)} delta={change(w.revenuePence, p.revenuePence)} />
      <Kpi icon="trend" tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300" label="Net profit, last 7 days" value={formatGBP(w.netPence)} delta={change(w.netPence, p.netPence)}>
        <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          after {formatGBP(w.feesPence)} fees{w.costsPence + w.aiSpendPence ? `, ${formatGBP(w.costsPence + w.aiSpendPence)} costs` : ""}
        </div>
      </Kpi>
      <Kpi
        icon="launch"
        tone="bg-orange-50 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300"
        label="Live listings"
        value={String(n.liveListings)}
        delta={exp ? { text: `${exp} expire${exp === 1 ? "s" : ""} within 14 days`, tone: "text-amber-600 dark:text-amber-400" } : { text: "None expiring soon", tone: "text-zinc-500 dark:text-zinc-400" }}
      />
    </div>
  );
}

// Same markup as the dashboard's Kpi tile, with a coloured change line as the foot.
function Kpi({ icon, tone, label, value, delta, children }: { icon: IconName; tone: string; label: string; value: string; delta: { text: string; tone: string }; children?: ReactNode }) {
  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</span>
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${tone}`}>
          <Icon name={icon} size={15} />
        </span>
      </div>
      <div className="mt-1 text-2xl leading-none font-semibold tracking-tight tabular-nums sm:text-[28px]">{value}</div>
      <div className={`mt-1.5 text-xs font-medium ${delta.tone}`}>{delta.text}</div>
      {children}
    </div>
  );
}

// ───────────── Smaller panels ─────────────

function FormatBars({ p }: { p: ShopNumbers["month"] }) {
  if (!p.sales && !p.revenuePence) return <p className="text-sm text-zinc-500 dark:text-zinc-400">No sales in the last 4 weeks yet.</p>;
  const max = Math.max(1, ...p.byFormat.map((f) => f.revenuePence));
  return (
    <ul className="space-y-3">
      {p.byFormat.map((f) => (
        <li key={f.format}>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="font-medium">{FORMAT_NAME[f.format]}</span>
            <span className="text-zinc-500 tabular-nums dark:text-zinc-400">
              {f.sales} sale{f.sales === 1 ? "" : "s"} · {formatGBP(f.revenuePence)} · {f.share}%
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/[0.06]">
            <div className={`h-full rounded-full ${FORMAT_BAR[f.format]}`} style={{ width: `${Math.max(0, (f.revenuePence / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function BestSellers({ p }: { p: ShopNumbers["month"] }) {
  if (!p.bestSellers.length) return <p className="text-sm text-zinc-500 dark:text-zinc-400">No sales in the last 4 weeks yet.</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-[11px] font-semibold tracking-[0.06em] text-zinc-500 uppercase">
          <th className="pb-2 font-semibold">Product</th>
          <th className="pb-2 text-right font-semibold">Sales</th>
          <th className="pb-2 text-right font-semibold">Revenue</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
        {p.bestSellers.map((b, i) => (
          <tr key={b.productId ?? `${b.title}-${i}`}>
            <td className="py-2 pr-2">
              <div className="truncate">{b.title}</div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">{FORMAT_NAME[b.format]}</div>
            </td>
            <td className="py-2 text-right tabular-nums">{b.sales}</td>
            <td className="py-2 text-right tabular-nums">{formatGBP(b.revenuePence)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Pipeline({ n }: { n: ShopNumbers }) {
  const w = n.week.pipeline;
  const cells: [string, number][] = [
    ["Started", w.started],
    ["Sent to Etsy", w.drafted],
    ["Went live", w.live],
    ["Dropped", w.dropped],
  ];
  return (
    <div className="space-y-4">
      <div>
        <div className="label mb-2">Last 7 days</div>
        <div className="grid grid-cols-4 gap-2">
          {cells.map(([label, v]) => (
            <div key={label} className="rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 text-center dark:border-white/10 dark:bg-white/[0.03]">
              <div className="text-lg font-semibold tabular-nums">{v}</div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">{label}</div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="label mb-2">Expiring on Etsy within 14 days</div>
        {n.expiringSoon.length ? (
          <ul className="divide-y divide-zinc-100 text-sm dark:divide-white/[0.06]">
            {n.expiringSoon.map((e) => (
              <li key={e.productId} className="flex items-center justify-between gap-2 py-1.5">
                <span className="min-w-0 truncate">{e.title}</span>
                <span className={`shrink-0 text-xs tabular-nums ${e.daysLeft <= 7 ? "text-amber-600 dark:text-amber-400" : "text-zinc-500 dark:text-zinc-400"}`}>
                  {e.daysLeft} day{e.daysLeft === 1 ? "" : "s"}
                </span>
              </li>
            ))}
            <li className="pt-2">
              <Link to="/room/launch" className="btn-soft px-2.5 py-1 text-xs">
                Review in Launch <Icon name="arrowRight" size={12} />
              </Link>
            </li>
          </ul>
        ) : (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">None that we know of. Expiry dates come from your connected Etsy shop.</p>
        )}
      </div>
    </div>
  );
}
