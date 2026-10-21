// Shop analytics: the whole shop at a glance, with charts. Real data only.
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../lib/api";
import { formatGBP, timeAgo } from "../lib/format";
import { ErrorNote, Section } from "../components/ui";
import { Icon, type IconName } from "../components/Icon";
import { FORMAT_INFO, type ProductFormat } from "../../shared/format";
import { VERDICT_TONE, type Verdict } from "./verdicts";

interface Totals {
  revenuePence: number;
  feesPence: number;
  costsPence: number;
  netPence: number;
  sales: number;
  orders: number;
  views: number | null;
  favourites: number | null;
}

interface Analytics {
  days: number;
  from: string;
  to: string;
  now: Totals;
  before: Totals;
  daily: { date: string; revenuePence: number; sales: number; views: number | null; favourites: number | null }[];
  byFormat: { format: ProductFormat; sales: number; revenuePence: number }[];
  byWeekday: { day: string; sales: number; revenuePence: number }[];
  byHour: { hour: number; sales: number }[];
  byPrice: { band: string; sales: number; revenuePence: number }[];
  topListings: { productId: string; title: string; revenuePence: number; sales: number; views: number | null; favourites: number | null; conversion: number | null }[];
  verdicts: Partial<Record<Verdict, number>>;
  reviews: { count: number; average: number | null; stars: number[] };
  etsy: { admirers: number | null; reviewAverage: number | null; reviewCount: number | null; activeListings: number | null; soldAllTime: number | null; openedAt: string | null; at: string } | null;
  partialViews: boolean;
}

const PERIODS: [number, string][] = [
  [7, "7 days"],
  [30, "30 days"],
  [90, "90 days"],
  [365, "12 months"],
];

const VERDICT_LABEL: Record<Verdict, string> = { star: "Selling well", steady: "Selling", browsed: "Looked at, not bought", liked: "Liked, not bought", hidden: "Hardly seen", new: "Too new", off: "Not live" };

function useIsDark() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.documentElement.classList.contains("dark")));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;

/** "↑ 12%" against the period before, or nothing when there's nothing to compare with. */
function Change({ now, before, invert = false }: { now: number | null; before: number | null; invert?: boolean }) {
  if (now === null || before === null) return <span className="text-zinc-400">no earlier data</span>;
  if (before === 0) return now === 0 ? <span className="text-zinc-400">same as before</span> : <span className="text-emerald-600 dark:text-emerald-400">new this period</span>;
  const d = (now - before) / Math.abs(before);
  if (Math.abs(d) < 0.005) return <span className="text-zinc-400">same as before</span>;
  const good = invert ? d < 0 : d > 0;
  return (
    <span className={good ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
      {d > 0 ? "↑" : "↓"} {Math.round(Math.abs(d) * 100)}% vs before
    </span>
  );
}

function Kpi({ label, value, icon, tone, children }: { label: string; value: string; icon: IconName; tone: string; children?: ReactNode }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</span>
        <span className={`grid h-7 w-7 place-items-center rounded-lg ${tone}`}>
          <Icon name={icon} size={15} />
        </span>
      </div>
      <div className="mt-1 text-2xl leading-none font-semibold tracking-tight tabular-nums">{value}</div>
      <div className="mt-1.5 text-xs">{children}</div>
    </div>
  );
}

function BarList({ rows, max, color }: { rows: { label: string; value: number; text: string }[]; max: number; color: string }) {
  return (
    <ul className="space-y-2.5 text-sm">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex justify-between gap-2">
            <span>{r.label}</span>
            <span className="text-zinc-500 tabular-nums dark:text-zinc-400">{r.text}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/10">
            <div className="h-full rounded-full" style={{ width: `${max ? (r.value / max) * 100 : 0}%`, background: color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ShopAnalytics() {
  const [days, setDays] = useState(30);
  const { data, error, isFetching } = useQuery({ queryKey: ["shop-analytics", days], queryFn: () => api.get<Analytics>(`/shop/analytics?days=${days}`) });
  const dark = useIsDark();
  const ink = dark ? "#a1a1aa" : "#71717a";
  const grid = dark ? "rgba(255,255,255,.08)" : "#e4e4e7";
  const axis = { tick: { fill: ink, fontSize: 11 }, axisLine: false, tickLine: false } as const;
  const tip = {
    contentStyle: { borderRadius: 8, border: `1px solid ${dark ? "rgba(255,255,255,.1)" : "#e4e4e7"}`, boxShadow: "0 4px 12px rgba(16,24,40,.08)", fontSize: 12, background: dark ? "#18181b" : "#fff", color: dark ? "#f4f4f5" : "#18181b" },
    cursor: { fill: dark ? "rgba(255,255,255,.04)" : "#f4f4f5" },
  };

  if (error) return <ErrorNote error={error} />;
  const n = data?.now;
  const b = data?.before;
  const aov = n && n.sales ? n.revenuePence / n.sales : null;
  const aovBefore = b && b.sales ? b.revenuePence / b.sales : null;
  const conv = n && n.views ? n.sales / n.views : null;
  const convBefore = b && b.views ? b.sales / b.views : null;
  const favRate = n && n.views ? (n.favourites ?? 0) / n.views : null;
  const shortDate = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  // A year of days is a lot of bars: group by week.
  const series = (() => {
    if (!data) return [];
    const rows = data.daily.map((d) => ({ label: shortDate(d.date), Revenue: d.revenuePence / 100, Sales: d.sales, Views: d.views, Favourites: d.favourites }));
    if (data.days <= 90) return rows;
    const weeks: typeof rows = [];
    for (let i = 0; i < rows.length; i += 7) {
      const chunk = rows.slice(i, i + 7);
      const sum = (k: "Revenue" | "Sales") => chunk.reduce((a, r) => a + r[k], 0);
      const sumN = (k: "Views" | "Favourites") => (chunk.every((r) => r[k] === null) ? null : chunk.reduce((a, r) => a + (r[k] ?? 0), 0));
      weeks.push({ label: chunk[0].label, Revenue: Math.round(sum("Revenue") * 100) / 100, Sales: sum("Sales"), Views: sumN("Views"), Favourites: sumN("Favourites") });
    }
    return weeks;
  })();
  const maxWeekday = Math.max(0, ...(data?.byWeekday ?? []).map((w) => w.sales));
  const best = data?.byWeekday.reduce((a, w) => (w.sales > a.sales ? w : a), { day: "", sales: 0, revenuePence: 0 });
  const busiestHour = data?.byHour.reduce((a, h) => (h.sales > a.sales ? h : a), { hour: -1, sales: 0 });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-zinc-200 bg-white p-0.5 dark:border-white/10 dark:bg-night-2" role="radiogroup" aria-label="Period">
          {PERIODS.map(([d, label]) => (
            <button
              key={d}
              role="radio"
              aria-checked={days === d}
              onClick={() => setDays(d)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${days === d ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {data && (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {shortDate(data.from)} – {shortDate(data.to)}, compared with the {data.days} days before{isFetching ? " · updating…" : ""}
          </span>
        )}
      </div>

      {!data || !n || !b ? (
        <p className="py-16 text-center text-sm text-zinc-500">Crunching the numbers…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Revenue" value={formatGBP(n.revenuePence)} icon="finance" tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
              <Change now={n.revenuePence} before={b.revenuePence} />
            </Kpi>
            <Kpi label="Net profit" value={formatGBP(n.netPence)} icon="trend" tone="bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300">
              <Change now={n.netPence} before={b.netPence} />
            </Kpi>
            <Kpi label="Sales" value={String(n.sales)} icon="orders" tone="bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
              <Change now={n.sales} before={b.sales} />
            </Kpi>
            <Kpi label="Average sale" value={aov !== null ? formatGBP(Math.round(aov)) : "—"} icon="store" tone="bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300">
              <Change now={aov} before={aovBefore} />
            </Kpi>
            <Kpi label="Views" value={n.views !== null ? n.views.toLocaleString() : "—"} icon="research" tone="bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300">
              <Change now={n.views} before={b.views} />
            </Kpi>
            <Kpi label="Favourites" value={n.favourites !== null ? n.favourites.toLocaleString() : "—"} icon="star" tone="bg-pink-50 text-pink-600 dark:bg-pink-500/15 dark:text-pink-300">
              <Change now={n.favourites} before={b.favourites} />
            </Kpi>
            <Kpi label="Views that buy" value={conv !== null ? pct(conv) : "—"} icon="check" tone="bg-teal-50 text-teal-600 dark:bg-teal-500/15 dark:text-teal-300">
              <Change now={conv} before={convBefore} />
            </Kpi>
            <Kpi label="Views that favourite" value={favRate !== null ? pct(favRate) : "—"} icon="activity" tone="bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
              <span className="text-zinc-500 dark:text-zinc-400">a sign of interest</span>
            </Kpi>
          </div>

          {data.etsy && (
            <div className="card grid grid-cols-2 gap-4 p-4 text-sm sm:grid-cols-4">
              {(
                [
                  ["Shop admirers", data.etsy.admirers?.toLocaleString() ?? "—", "people who favourited your shop"],
                  ["Review average", data.etsy.reviewAverage !== null ? `${data.etsy.reviewAverage.toFixed(1)} / 5` : "—", `${data.etsy.reviewCount ?? 0} review${data.etsy.reviewCount === 1 ? "" : "s"}`],
                  ["Sold on Etsy, all time", data.etsy.soldAllTime?.toLocaleString() ?? "—", data.etsy.openedAt ? `since ${new Date(data.etsy.openedAt).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}` : ""],
                  ["Active listings", data.etsy.activeListings?.toLocaleString() ?? "—", `from Etsy, ${timeAgo(data.etsy.at)}`],
                ] as [string, string, string][]
              ).map(([label, value, hint]) => (
                <div key={label}>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">{label}</div>
                  <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
                  <div className="text-[11px] text-zinc-400">{hint}</div>
                </div>
              ))}
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Section title={`Revenue and sales ${data.days > 90 ? "by week" : "by day"}`}>
              <div className="h-64">
                <ResponsiveContainer>
                  <ComposedChart data={series} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={grid} />
                    <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={24} />
                    <YAxis yAxisId="gbp" {...axis} tickFormatter={(v) => `£${v}`} width={52} />
                    <YAxis yAxisId="n" orientation="right" {...axis} allowDecimals={false} width={28} />
                    <Tooltip {...tip} formatter={(v: unknown, name: unknown) => (name === "Revenue" ? `£${Number(v).toFixed(2)}` : String(v))} />
                    <Legend wrapperStyle={{ fontSize: 12, color: ink }} iconType="circle" />
                    <Bar yAxisId="gbp" dataKey="Revenue" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={18} />
                    <Line yAxisId="n" dataKey="Sales" stroke="#4f46e5" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Section>
            <Section title={`Views and favourites ${data.days > 90 ? "by week" : "by day"}`}>
              <div className="h-64">
                <ResponsiveContainer>
                  <AreaChart data={series} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={grid} />
                    <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={24} />
                    <YAxis yAxisId="v" {...axis} allowDecimals={false} width={40} />
                    {/* Favourites are far fewer than views: their own scale on the right keeps the line readable. */}
                    <YAxis yAxisId="f" orientation="right" {...axis} allowDecimals={false} width={28} />
                    <Tooltip {...tip} />
                    <Legend wrapperStyle={{ fontSize: 12, color: ink }} iconType="circle" />
                    <Area yAxisId="v" dataKey="Views" stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.15} strokeWidth={2} connectNulls />
                    <Area yAxisId="f" dataKey="Favourites" stroke="#ec4899" fill="#ec4899" fillOpacity={0.08} strokeWidth={2} connectNulls />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              {data.partialViews && <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Etsy only gives running totals, so daily views fill in from when BinkSuite started reading them.</p>}
            </Section>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Section title="From view to sale">
              {n.views ? (
                <BarList
                  max={n.views}
                  color="#4f46e5"
                  rows={[
                    { label: "Views", value: n.views, text: n.views.toLocaleString() },
                    { label: "Favourites", value: n.favourites ?? 0, text: `${(n.favourites ?? 0).toLocaleString()} · ${pct((n.favourites ?? 0) / n.views)}` },
                    { label: "Sales", value: n.sales, text: `${n.sales} · ${pct(n.sales / n.views)}` },
                  ]}
                />
              ) : (
                <p className="text-sm text-zinc-500">Views appear once BinkSuite has a few daily readings from Etsy.</p>
              )}
            </Section>
            <Section title="Where the money went">
              <BarList
                max={Math.max(n.revenuePence, 1)}
                color="#10b981"
                rows={[
                  { label: "Revenue", value: n.revenuePence, text: formatGBP(n.revenuePence) },
                  { label: "Etsy fees", value: n.feesPence, text: `${formatGBP(n.feesPence)}${n.revenuePence ? ` · ${pct(n.feesPence / n.revenuePence)}` : ""}` },
                  { label: "Costs (inc. AI)", value: n.costsPence, text: formatGBP(n.costsPence) },
                  { label: "You kept", value: Math.max(0, n.netPence), text: formatGBP(n.netPence) },
                ]}
              />
            </Section>
            <Section title="Sales by type">
              {data.byFormat.length ? (
                <BarList
                  max={Math.max(...data.byFormat.map((f) => f.revenuePence), 1)}
                  color="#8b5cf6"
                  rows={data.byFormat.map((f) => ({ label: FORMAT_INFO[f.format].long, value: f.revenuePence, text: `${f.sales} · ${formatGBP(f.revenuePence)}` }))}
                />
              ) : (
                <p className="text-sm text-zinc-500">No sales in this period yet.</p>
              )}
            </Section>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="Best days to sell">
              <div className="h-52">
                <ResponsiveContainer>
                  <BarChart data={data.byWeekday} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={grid} />
                    <XAxis dataKey="day" {...axis} />
                    <YAxis {...axis} allowDecimals={false} width={32} />
                    <Tooltip {...tip} formatter={(v: unknown) => [`${v} sales`, ""]} />
                    <Bar dataKey="sales" fill="#f59e0b" radius={[3, 3, 0, 0]} maxBarSize={32} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{maxWeekday && best?.day ? `${best.day} is your busiest day. A good day to post pins and renew listings.` : "Patterns show up once you have a few sales."}</p>
            </Section>
            <Section title="Time of day (UK)">
              <div className="h-52">
                <ResponsiveContainer>
                  <BarChart data={data.byHour.map((h) => ({ ...h, label: `${h.hour}:00` }))} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={grid} />
                    <XAxis dataKey="label" {...axis} interval={3} />
                    <YAxis {...axis} allowDecimals={false} width={32} />
                    <Tooltip {...tip} formatter={(v: unknown) => [`${v} sales`, ""]} />
                    <Bar dataKey="sales" fill="#0ea5e9" radius={[3, 3, 0, 0]} maxBarSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{busiestHour && busiestHour.sales > 0 ? `Most sales come in around ${busiestHour.hour}:00.` : "Patterns show up once you have a few sales."}</p>
            </Section>
          </div>

          <Section title="Top listings">
            {data.topListings.length ? (
              <div className="-mx-1 overflow-x-auto">
                <table className="w-full min-w-[620px] table-fixed text-sm">
                  <colgroup>
                    <col className="w-[40%]" />
                    <col />
                    <col />
                    <col />
                    <col />
                    <col />
                  </colgroup>
                  <thead>
                    <tr className="text-left text-[11px] font-semibold tracking-[0.06em] text-zinc-500 uppercase">
                      <th className="px-1 py-2">Listing</th>
                      <th className="px-1 py-2 text-right">Revenue</th>
                      <th className="px-1 py-2 text-right">Sales</th>
                      <th className="px-1 py-2 text-right">Views</th>
                      <th className="px-1 py-2 text-right">Favourites</th>
                      <th className="px-1 py-2 text-right">Views that buy</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
                    {data.topListings.map((l) => (
                      <tr key={l.productId}>
                        <td className="max-w-0 px-1 py-2">
                          <Link to={`/shop/${l.productId}`} className="block truncate font-medium hover:underline">
                            {l.title}
                          </Link>
                        </td>
                        <td className="px-1 py-2 text-right tabular-nums">{formatGBP(l.revenuePence)}</td>
                        <td className="px-1 py-2 text-right tabular-nums">{l.sales}</td>
                        <td className="px-1 py-2 text-right tabular-nums">{l.views ?? "—"}</td>
                        <td className="px-1 py-2 text-right tabular-nums">{l.favourites ?? "—"}</td>
                        <td className="px-1 py-2 text-right tabular-nums">{l.conversion !== null ? pct(l.conversion) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-zinc-500">Nothing on Etsy yet.</p>
            )}
          </Section>

          <div className="grid gap-4 lg:grid-cols-3">
            <Section title="Price points">
              <BarList max={Math.max(...data.byPrice.map((p) => p.sales), 1)} color="#14b8a6" rows={data.byPrice.map((p) => ({ label: p.band, value: p.sales, text: `${p.sales} · ${formatGBP(p.revenuePence)}` }))} />
            </Section>
            <Section title="Listing health">
              {Object.keys(data.verdicts).length ? (
                <ul className="space-y-2 text-sm">
                  {(Object.entries(data.verdicts) as [Verdict, number][]).map(([v, count]) => (
                    <li key={v} className="flex items-center justify-between gap-2">
                      <span className={`inline-flex items-center gap-2 ${VERDICT_TONE[v].text}`}>
                        <span className={`h-2 w-2 rounded-full ${VERDICT_TONE[v].dot}`} />
                        {VERDICT_LABEL[v]}
                      </span>
                      <span className="font-semibold tabular-nums">{count}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-zinc-500">Shows once listings are on Etsy.</p>
              )}
              <Link to="/room/strategy" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline dark:text-indigo-300">
                What to do about each <Icon name="arrowRight" size={12} />
              </Link>
            </Section>
            <Section title="Reviews">
              <div className="mb-3 flex items-baseline gap-2">
                <span className="text-2xl font-semibold tabular-nums">{data.reviews.average ?? "—"}</span>
                <span className="text-xs text-zinc-500">
                  out of 5 · {data.reviews.count} review{data.reviews.count === 1 ? "" : "s"}
                </span>
              </div>
              <BarList
                max={Math.max(...data.reviews.stars, 1)}
                color="#fbbf24"
                rows={[5, 4, 3, 2, 1].map((s) => ({ label: `${s} star${s === 1 ? "" : "s"}`, value: data.reviews.stars[s - 1], text: String(data.reviews.stars[s - 1]) }))}
              />
            </Section>
          </div>
        </>
      )}
    </div>
  );
}
