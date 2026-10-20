// Finance Vault: real money only. Live fee calculator, ledger, charts, caps, trading allowance.
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../../lib/api";
import { useSnapshot, logEvent } from "../../lib/hooks";
import { useUi } from "../../lib/store";
import { formatGBP, toPence } from "../../lib/format";
import { calculateFees, minimumPriceFor } from "../../../shared/fees";
import type { FinanceSummary, LedgerEntry } from "../../../shared/api";
import { ErrorNote, ProgressBar, Section, Toggle } from "../../components/ui";
import { Icon } from "../../components/Icon";

// Series colours shared with the rest of the app: indigo, emerald, amber, rose.
const SERIES = { sales: "#4f46e5", net: "#10b981", fees: "#f59e0b", costs: "#e11d48", loss: "#e11d48" };

function useIsDark() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.documentElement.classList.contains("dark")));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

export function FinanceRoom() {
  const summary = useQuery({ queryKey: ["finance-summary"], queryFn: () => api.get<FinanceSummary>("/finance/summary"), refetchInterval: 10_000 });
  const ledger = useQuery({ queryKey: ["ledger"], queryFn: () => api.get<{ entries: LedgerEntry[] }>("/finance/ledger"), refetchInterval: 10_000 });
  const s = summary.data;
  return (
    <div className="space-y-4">
      {s && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Tile label="Sales" value={formatGBP(s.totals.salesPence)} />
          <Tile label="Etsy fees" value={formatGBP(s.totals.feesPence)} />
          <Tile label="Costs (inc. AI)" value={formatGBP(s.totals.costsPence)} />
          <Tile label="Net profit" value={formatGBP(s.totals.netPence)} strong />
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <FeeCalculator />
        </div>
        <div className="space-y-4 lg:col-span-2">
          {s && <SpendCaps s={s} />}
          {s && <TradingAllowance s={s} />}
        </div>
      </div>
      {s && s.monthly.length > 0 && <Charts s={s} />}
      <Ledger entries={ledger.data?.entries ?? []} />
    </div>
  );
}

function Tile({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="card p-5">
      <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className={`mt-2 text-[28px] leading-none font-semibold tracking-tight tabular-nums ${strong ? "text-accent dark:text-indigo-400" : ""}`}>{value}</div>
    </div>
  );
}

function FeeCalculator() {
  const { data: snap } = useSnapshot();
  const qc = useQueryClient();
  const toast = useUi((s) => s.toast);
  const [price, setPrice] = useState("4.99");
  const [qty, setQty] = useState("1");
  const [cost, setCost] = useState("0.10");
  const [ads, setAds] = useState(false);
  const [nonGbp, setNonGbp] = useState(false);
  const logged = useRef(false);
  const settings = snap?.settings;
  const result = useMemo(
    () => (settings ? calculateFees({ pricePence: toPence(price), quantity: Number(qty) || 1, costPence: toPence(cost), offsiteAds: ads, nonGbp }, settings.fees) : null),
    [price, qty, cost, ads, nonGbp, settings],
  );
  const touch = () => {
    if (!logged.current) {
      logged.current = true;
      logEvent("fee_calc");
    }
  };
  const record = useMutation({
    mutationFn: () =>
      api.post("/finance/sales", {
        pricePence: toPence(price) * (Number(qty) || 1),
        description: `Sale recorded from calculator (×${Number(qty) || 1})`,
        nonGbp,
        offsiteAds: ads,
      }),
    onSuccess: () => {
      toast({ icon: "", title: "Sale recorded", body: "Added to your ledger with its fees" });
      qc.invalidateQueries();
    },
  });
  if (!settings || !result) return null;
  const floor = minimumPriceFor(settings.minProfitPence, toPence(cost), settings.fees);
  const meets = result.netPence >= settings.minProfitPence * (Number(qty) || 1);
  return (
    <Section title="Fee calculator" right={<span className="chip">Etsy UK · live</span>}>
      <div className="grid gap-3 sm:grid-cols-3" onChange={touch}>
        <label>
          <span className="label">Price (£)</span>
          <input className="input text-base font-medium tabular-nums" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} aria-label="Price in pounds" />
        </label>
        <label>
          <span className="label">Quantity</span>
          <input className="input" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
        </label>
        <label>
          <span className="label">Your cost (£)</span>
          <input className="input" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
        </label>
      </div>
      <div className="mt-4 flex flex-wrap gap-4 text-sm text-zinc-700 dark:text-zinc-300">
        <label className="flex items-center gap-2">
          <Toggle checked={ads} onChange={(v) => (setAds(v), touch())} label="Offsite Ads sale" /> Offsite Ads sale
        </label>
        <label className="flex items-center gap-2">
          <Toggle checked={nonGbp} onChange={(v) => (setNonGbp(v), touch())} label="Paid in another currency" /> Paid in another currency
        </label>
      </div>
      <table className="mt-4 w-full text-sm">
        <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
          {result.lines.map((l) => (
            <tr key={l.key}>
              <td className="py-1.5 text-zinc-600 dark:text-zinc-400">{l.label}</td>
              <td className="py-1.5 text-right tabular-nums">{formatGBP(l.pence)}</td>
            </tr>
          ))}
          <tr>
            <td className="py-1.5 text-zinc-600 dark:text-zinc-400">VAT on fees ({Math.round(settings.fees.vatRate * 100)}%)</td>
            <td className="py-1.5 text-right tabular-nums">{formatGBP(result.vatPence)}</td>
          </tr>
          <tr className="font-medium">
            <td className="py-1.5">Total Etsy fees</td>
            <td className="py-1.5 text-right tabular-nums">{formatGBP(result.totalFeesPence)}</td>
          </tr>
          <tr>
            <td className="py-1.5 text-zinc-600 dark:text-zinc-400">Your costs</td>
            <td className="py-1.5 text-right tabular-nums">{formatGBP(result.costPence)}</td>
          </tr>
        </tbody>
      </table>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
        <div>
          <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">You keep</div>
          <div className="mt-1 text-[28px] leading-none font-semibold tracking-tight tabular-nums" data-testid="net">
            {formatGBP(result.netPence)}
          </div>
          <div className="mt-1 text-xs text-zinc-500 tabular-nums dark:text-zinc-400">{Math.round(result.margin * 100)}% of the sale</div>
        </div>
        <div className="text-right text-sm">
          <div className={`flex items-center justify-end gap-1.5 font-medium ${meets ? "text-emerald-700 dark:text-emerald-300" : "text-rose-600 dark:text-rose-400"}`}>
            <Icon name={meets ? "check" : "alert"} size={15} />
            {meets ? "Meets" : "Below"} your {formatGBP(settings.minProfitPence)} minimum
          </div>
          <div className="mt-0.5 text-xs text-zinc-500 tabular-nums dark:text-zinc-400">Lowest price that does: {formatGBP(floor)}</div>
        </div>
      </div>
      <ErrorNote error={record.error} />
      <button className="btn-soft mt-3 w-full" onClick={() => record.mutate()} disabled={record.isPending || toPence(price) <= 0}>
        Record this as a real sale
      </button>
    </Section>
  );
}

function SpendCaps({ s }: { s: FinanceSummary }) {
  const rows = [
    ["Today", s.spend.todayPence, s.spend.dailyCapPence],
    ["This month", s.spend.monthPence, s.spend.monthlyCapPence],
  ] as const;
  return (
    <Section title="AI spend caps">
      <div className="space-y-3">
        {rows.map(([label, used, cap]) => (
          <div key={label}>
            <div className="mb-1 flex justify-between text-sm">
              <span className="text-zinc-700 dark:text-zinc-300">{label}</span>
              <span className="font-medium tabular-nums">
                {formatGBP(used)} / {formatGBP(cap)}
              </span>
            </div>
            <ProgressBar value={cap ? used / cap : 1} color={used >= cap ? "#e11d48" : "#4f46e5"} label={`${label} spend`} />
          </div>
        ))}
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Agents stop when a cap is reached. Change caps in Settings.</p>
      </div>
    </Section>
  );
}

function TradingAllowance({ s }: { s: FinanceSummary }) {
  const t = s.taxYear;
  const pct = t.grossPence / t.allowancePence;
  return (
    <Section title={`Trading allowance ${t.label}`}>
      <div className="mb-1 flex justify-between text-sm">
        <span className="text-zinc-700 dark:text-zinc-300">Gross trading income</span>
        <span className="font-medium tabular-nums">
          {formatGBP(t.grossPence)} / {formatGBP(t.allowancePence)}
        </span>
      </div>
      <ProgressBar value={pct} color={pct >= 1 ? "#e11d48" : pct >= 0.8 ? "#f59e0b" : "#10b981"} label="Trading allowance used" />
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        {pct >= 1
          ? "You've passed £1,000 gross this tax year — you'll likely need to register for Self Assessment."
          : `£${((t.allowancePence - t.grossPence) / 100).toFixed(2)} left before the £1,000 allowance.`}{" "}
        A record-keeping aid, not tax advice.
      </p>
    </Section>
  );
}

function Charts({ s }: { s: FinanceSummary }) {
  const dark = useIsDark();
  const c = SERIES;
  const ink = dark ? "#a1a1aa" : "#71717a";
  const grid = dark ? "rgba(255,255,255,.08)" : "#e4e4e7";
  const data = s.monthly.map((m) => ({
    month: new Date(m.month + "-01T00:00:00Z").toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
    Sales: m.salesPence / 100,
    Fees: m.feesPence / 100,
    Costs: m.costsPence / 100,
    Net: m.netPence / 100,
  }));
  const tooltip = {
    formatter: (v: unknown) => `£${Number(v).toFixed(2)}`,
    contentStyle: { borderRadius: 8, border: `1px solid ${dark ? "rgba(255,255,255,.1)" : "#e4e4e7"}`, boxShadow: "0 4px 12px rgba(16,24,40,.08)", fontSize: 12, background: dark ? "#18181b" : "#fff", color: dark ? "#f4f4f5" : "#18181b" },
    cursor: { fill: dark ? "rgba(255,255,255,.04)" : "#f4f4f5" },
  };
  const axis = { tick: { fill: ink, fontSize: 11 }, axisLine: false, tickLine: false } as const;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="Net profit by month">
        <div className="h-60">
          <ResponsiveContainer>
            <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={grid} />
              <XAxis dataKey="month" {...axis} />
              <YAxis {...axis} tickFormatter={(v) => `£${v}`} width={52} />
              <Tooltip {...tooltip} />
              <Bar dataKey="Net" radius={[4, 4, 0, 0]} maxBarSize={36}>
                {data.map((d) => (
                  <Cell key={d.month} fill={d.Net >= 0 ? c.net : c.loss} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>
      <Section title="Sales, fees and costs">
        <div className="h-60">
          <ResponsiveContainer>
            <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barGap={2}>
              <CartesianGrid vertical={false} stroke={grid} />
              <XAxis dataKey="month" {...axis} />
              <YAxis {...axis} tickFormatter={(v) => `£${v}`} width={52} />
              <Tooltip {...tooltip} />
              <Legend wrapperStyle={{ fontSize: 12, color: ink }} iconType="circle" />
              <Bar dataKey="Sales" fill={c.sales} radius={[4, 4, 0, 0]} maxBarSize={22} />
              <Bar dataKey="Fees" fill={c.fees} radius={[4, 4, 0, 0]} maxBarSize={22} />
              <Bar dataKey="Costs" fill={c.costs} radius={[4, 4, 0, 0]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>
    </div>
  );
}

function Ledger({ entries }: { entries: LedgerEntry[] }) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | "real" | "demo">("all");
  const [adding, setAdding] = useState(false);
  const del = useMutation({ mutationFn: (id: string) => api.del(`/finance/entries/${id}`), onSuccess: () => qc.invalidateQueries() });
  const shown = entries.filter((e) => filter === "all" || (filter === "demo" ? e.demo : !e.demo));
  const exportCsv = () => {
    const rows = [["date", "kind", "category", "description", "amount_gbp", "non_gbp", "demo"]];
    for (const e of shown) rows.push([e.date.slice(0, 10), e.kind, e.category, e.description, (e.amountPence / 100).toFixed(2), e.nonGbp ? "yes" : "no", e.demo ? "yes" : "no"]);
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `binksuite-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <Section
      title="Ledger"
      right={
        <div className="flex flex-wrap gap-2">
          <select className="input !w-auto !py-1" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="Filter ledger">
            <option value="all">All</option>
            <option value="real">Real only</option>
            <option value="demo">Demo only</option>
          </select>
          <button className="btn-soft !py-1" onClick={() => setAdding((v) => !v)}>
            Add cost
          </button>
          <button className="btn-soft !py-1" onClick={exportCsv}>
            Export CSV
          </button>
        </div>
      }
    >
      {adding && <AddCost onDone={() => setAdding(false)} />}
      <div className="max-h-[420px] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 border-b border-zinc-200 bg-white text-left text-[11px] font-semibold tracking-[0.06em] text-zinc-500 uppercase dark:border-white/10 dark:bg-night-2 dark:text-zinc-400">
            <tr>
              <th className="py-2 pr-3">Date</th>
              <th className="pr-3">What</th>
              <th className="hidden pr-3 sm:table-cell">Category</th>
              <th className="text-right">Amount</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
            {shown.map((e) => (
              <tr key={e.id} className="group">
                <td className="py-2 pr-3 whitespace-nowrap text-zinc-500 tabular-nums dark:text-zinc-400">{new Date(e.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</td>
                <td className="max-w-[180px] truncate pr-3">
                  {e.demo && <span className="chip mr-1.5 !px-1.5 !py-0 text-[10px]">Demo</span>}
                  {e.description}
                </td>
                <td className="hidden pr-3 text-zinc-500 sm:table-cell dark:text-zinc-400">{e.category}</td>
                <td className={`text-right font-medium tabular-nums ${e.amountPence >= 0 ? "text-emerald-700 dark:text-emerald-300" : ""}`}>{formatGBP(e.amountPence)}</td>
                <td className="text-right">
                  {e.kind !== "fee" && (
                    <button
                      className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-rose-600 dark:hover:bg-white/10 dark:hover:text-rose-400"
                      aria-label="Delete entry"
                      title="Delete entry"
                      onClick={() => confirm(`Delete “${e.description}”${e.kind === "sale" ? " and its fees" : ""}?`) && del.mutate(e.id)}
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-zinc-500 dark:text-zinc-400">
                  No entries yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function AddCost({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<"cost" | "api" | "refund">("cost");
  const [category, setCategory] = useState("Software");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const add = useMutation({
    mutationFn: () => api.post("/finance/entries", { kind, category, description, amountPence: toPence(amount) }),
    onSuccess: () => {
      qc.invalidateQueries();
      onDone();
    },
  });
  return (
    <form
      className="mb-4 grid gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 sm:grid-cols-5 dark:border-white/10 dark:bg-white/[0.03]"
      onSubmit={(e) => {
        e.preventDefault();
        add.mutate();
      }}
    >
      <select className="input" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} aria-label="Kind">
        <option value="cost">Cost</option>
        <option value="api">AI / API spend</option>
        <option value="refund">Refund</option>
      </select>
      <input className="input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category" aria-label="Category" />
      <input className="input sm:col-span-2" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What was it?" aria-label="Description" required />
      <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="£" aria-label="Amount in pounds" required />
      <div className="sm:col-span-5">
        <ErrorNote error={add.error} />
        <button className="btn-primary" disabled={add.isPending}>
          Add
        </button>
      </div>
    </form>
  );
}
