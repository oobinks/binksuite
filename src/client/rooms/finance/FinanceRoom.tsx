// Finance Vault: real money only. Live fee calculator, ledger, charts, caps, trading allowance.
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../../lib/api";
import { useSnapshot, logEvent } from "../../lib/hooks";
import { celebrate, useUi } from "../../lib/store";
import { formatGBP, toPence } from "../../lib/format";
import { calculateFees, minimumPriceFor } from "../../../shared/fees";
import type { FinanceSummary, LedgerEntry } from "../../../shared/api";
import { ErrorNote, ProgressBar, Section, Toggle } from "../../components/ui";

// Validated categorical palette (dataviz reference slots 1–3), light + dark steps.
const SERIES = {
  light: { sales: "#2a78d6", fees: "#eb6834", costs: "#1baf7a" },
  dark: { sales: "#3987e5", fees: "#d95926", costs: "#199e70" },
};

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
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile label="Sales" value={formatGBP(s.totals.salesPence)} icon="🛍️" />
          <Tile label="Etsy fees" value={formatGBP(s.totals.feesPence)} icon="🏷️" />
          <Tile label="Costs (inc. AI)" value={formatGBP(s.totals.costsPence)} icon="📝" />
          <Tile label="Net profit = coins" value={formatGBP(s.totals.netPence)} icon="💰" strong />
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

function Tile({ label, value, icon, strong }: { label: string; value: string; icon: string; strong?: boolean }) {
  return (
    <div className={`card p-3 ${strong ? "ring-2 ring-amber-300" : ""}`}>
      <div className="label">
        <span aria-hidden>{icon}</span> {label}
      </div>
      <div className="text-2xl font-black tabular-nums">{value}</div>
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
      celebrate("small");
      toast({ icon: "💰", title: "Sale recorded", body: "Added to your ledger with its fees" });
      qc.invalidateQueries();
    },
  });
  if (!settings || !result) return null;
  const floor = minimumPriceFor(settings.minProfitPence, toPence(cost), settings.fees);
  const meets = result.netPence >= settings.minProfitPence * (Number(qty) || 1);
  return (
    <Section title="Fee calculator" icon="🔢" right={<span className="chip">Etsy UK · live</span>}>
      <div className="grid gap-3 sm:grid-cols-3" onChange={touch}>
        <label>
          <span className="label">Price (£)</span>
          <input className="input text-lg font-bold" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} aria-label="Price in pounds" />
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
      <div className="mt-3 flex flex-wrap gap-4 text-sm font-semibold">
        <label className="flex items-center gap-2">
          <Toggle checked={ads} onChange={(v) => (setAds(v), touch())} label="Offsite Ads sale" /> Offsite Ads sale
        </label>
        <label className="flex items-center gap-2">
          <Toggle checked={nonGbp} onChange={(v) => (setNonGbp(v), touch())} label="Paid in another currency" /> Paid in another currency
        </label>
      </div>
      <table className="mt-4 w-full text-sm">
        <tbody>
          {result.lines.map((l) => (
            <tr key={l.key} className="border-b border-black/5 dark:border-white/5">
              <td className="py-1">{l.label}</td>
              <td className="py-1 text-right tabular-nums">{formatGBP(l.pence)}</td>
            </tr>
          ))}
          <tr className="border-b border-black/5 dark:border-white/5">
            <td className="py-1">VAT on fees ({Math.round(settings.fees.vatRate * 100)}%)</td>
            <td className="py-1 text-right tabular-nums">{formatGBP(result.vatPence)}</td>
          </tr>
          <tr className="font-bold">
            <td className="py-1">Total Etsy fees</td>
            <td className="py-1 text-right tabular-nums">{formatGBP(result.totalFeesPence)}</td>
          </tr>
          <tr>
            <td className="py-1">Your costs</td>
            <td className="py-1 text-right tabular-nums">{formatGBP(result.costPence)}</td>
          </tr>
        </tbody>
      </table>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-emerald-50 p-3 dark:bg-emerald-900/25">
        <div>
          <div className="text-xs font-bold uppercase">You keep</div>
          <div className="text-3xl font-black tabular-nums" data-testid="net">
            {formatGBP(result.netPence)}
          </div>
          <div className="text-xs font-semibold">{Math.round(result.margin * 100)}% of the sale</div>
        </div>
        <div className="text-right text-sm">
          <div className={`font-bold ${meets ? "text-emerald-700 dark:text-emerald-300" : "text-rose-600"}`}>
            {meets ? "✅ Meets" : "⚠️ Below"} your {formatGBP(settings.minProfitPence)} minimum
          </div>
          <div className="text-xs">Lowest price that does: {formatGBP(floor)}</div>
        </div>
      </div>
      <ErrorNote error={record.error} />
      <button className="btn-soft mt-3 w-full" onClick={() => record.mutate()} disabled={record.isPending || toPence(price) <= 0}>
        📝 Record this as a real sale
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
    <Section title="AI spend caps" icon="🛑">
      <div className="space-y-3">
        {rows.map(([label, used, cap]) => (
          <div key={label}>
            <div className="flex justify-between text-sm font-bold">
              <span>{label}</span>
              <span className="tabular-nums">
                {formatGBP(used)} / {formatGBP(cap)}
              </span>
            </div>
            <ProgressBar value={cap ? used / cap : 1} color={used >= cap ? "#e0607e" : "#5bbf9a"} label={`${label} spend`} />
          </div>
        ))}
        <p className="text-xs text-cocoa dark:text-stone-400">Agents stop with ⛔ when a cap is reached. Change caps in Settings.</p>
      </div>
    </Section>
  );
}

function TradingAllowance({ s }: { s: FinanceSummary }) {
  const t = s.taxYear;
  const pct = t.grossPence / t.allowancePence;
  return (
    <Section title={`Trading allowance ${t.label}`} icon="💷">
      <div className="flex justify-between text-sm font-bold">
        <span>Gross trading income</span>
        <span className="tabular-nums">
          {formatGBP(t.grossPence)} / {formatGBP(t.allowancePence)}
        </span>
      </div>
      <ProgressBar value={pct} color={pct >= 1 ? "#e0607e" : pct >= 0.8 ? "#f2b35b" : "#5bbf9a"} label="Trading allowance used" />
      <p className="mt-2 text-xs text-cocoa dark:text-stone-400">
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
  const c = dark ? SERIES.dark : SERIES.light;
  const ink = dark ? "#c3c2b7" : "#52514e";
  const grid = dark ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.07)";
  const data = s.monthly.map((m) => ({
    month: new Date(m.month + "-01T00:00:00Z").toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
    Sales: m.salesPence / 100,
    Fees: m.feesPence / 100,
    Costs: m.costsPence / 100,
    Net: m.netPence / 100,
  }));
  const tooltip = {
    formatter: (v: unknown) => `£${Number(v).toFixed(2)}`,
    contentStyle: { borderRadius: 12, border: "none", background: dark ? "#2a2632" : "#fff", color: dark ? "#f0efec" : "#0b0b0b" },
    cursor: { fill: dark ? "rgba(255,255,255,.05)" : "rgba(0,0,0,.04)" },
  };
  const axis = { tick: { fill: ink, fontSize: 12 }, axisLine: false, tickLine: false } as const;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="Net profit by month" icon="📈">
        <div className="h-60">
          <ResponsiveContainer>
            <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={grid} />
              <XAxis dataKey="month" {...axis} />
              <YAxis {...axis} tickFormatter={(v) => `£${v}`} width={52} />
              <Tooltip {...tooltip} />
              <Bar dataKey="Net" radius={[4, 4, 0, 0]} maxBarSize={36}>
                {data.map((d) => (
                  <Cell key={d.month} fill={d.Net >= 0 ? c.sales : c.fees} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>
      <Section title="Sales, fees and costs" icon="📊">
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
      icon="📒"
      right={
        <div className="flex flex-wrap gap-2">
          <select className="input !w-auto !py-1" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="Filter ledger">
            <option value="all">All</option>
            <option value="real">Real only</option>
            <option value="demo">Demo only</option>
          </select>
          <button className="btn-soft !py-1" onClick={() => setAdding((v) => !v)}>
            ➕ Cost
          </button>
          <button className="btn-soft !py-1" onClick={exportCsv}>
            ⬇️ CSV
          </button>
        </div>
      }
    >
      {adding && <AddCost onDone={() => setAdding(false)} />}
      <div className="max-h-[420px] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white text-left text-xs uppercase text-cocoa dark:bg-night-2 dark:text-stone-400">
            <tr>
              <th className="py-1.5">Date</th>
              <th>What</th>
              <th className="hidden sm:table-cell">Category</th>
              <th className="text-right">Amount</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {shown.map((e) => (
              <tr key={e.id} className="border-t border-black/5 dark:border-white/5">
                <td className="py-1.5 whitespace-nowrap">{new Date(e.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</td>
                <td className="max-w-[180px] truncate">
                  {e.demo && <span className="chip mr-1 bg-honey/25 text-[10px]">demo</span>}
                  {e.description}
                </td>
                <td className="hidden text-cocoa sm:table-cell dark:text-stone-400">{e.category}</td>
                <td className={`text-right font-bold tabular-nums ${e.amountPence >= 0 ? "text-emerald-700 dark:text-emerald-300" : ""}`}>{formatGBP(e.amountPence)}</td>
                <td className="text-right">
                  {e.kind !== "fee" && (
                    <button
                      className="opacity-40 hover:opacity-100"
                      aria-label="Delete entry"
                      onClick={() => confirm(`Delete “${e.description}”${e.kind === "sale" ? " and its fees" : ""}?`) && del.mutate(e.id)}
                    >
                      🗑️
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-cocoa">
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
      className="mb-3 grid gap-2 rounded-xl bg-black/5 p-3 sm:grid-cols-5 dark:bg-white/5"
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
