// A quick look at a spreadsheet design: the dashboard (totals, goals, breakdowns, trends),
// the Settings lists, then each tab with its example rows.
import { useState } from "react";
import { dataSheets, formatValue, hasDashboard, normaliseSpec, previewValues, SETTINGS_TAB, SUMMARY_TAB, type SheetSpec } from "../../../shared/sheetSpec";

function Bar({ value, max, colour }: { value: number; max: number; colour: string }) {
  return (
    <span className="block h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
      <span className="block h-full rounded-full" style={{ width: `${max ? Math.max(2, (Math.abs(value) / max) * 100) : 0}%`, background: colour }} />
    </span>
  );
}

export function SheetPreview({ spec: raw }: { spec: SheetSpec }) {
  const spec = normaliseSpec(raw);
  const values = previewValues(spec);
  const tabs = [...(hasDashboard(spec) ? [SUMMARY_TAB] : []), ...(spec.lists.length ? [SETTINGS_TAB] : []), ...spec.tabs.map((t) => t.name)];
  const [open, setOpen] = useState(tabs[0]);
  const tabIndex = spec.tabs.findIndex((t) => t.name === open);
  const sheetCount = dataSheets(spec).length + 1 + (hasDashboard(spec) ? 1 : 0) + (spec.lists.length ? 1 : 0);
  const typeOf = (tab: string, col: string) => spec.tabs.find((t) => t.name === tab)?.columns.find((c) => c.header === col)?.type ?? "money";
  return (
    <div className="overflow-hidden rounded-xl ring-1 ring-black/10 dark:ring-white/10">
      <div className="flex items-start justify-between gap-2 px-3 py-2" style={{ background: spec.accent }}>
        <div>
          <div className="font-black text-white">{spec.title}</div>
          {spec.subtitle && <div className="text-xs text-white/85">{spec.subtitle}</div>}
        </div>
        <span className="chip shrink-0 bg-white/90 text-ink">{sheetCount} tabs</span>
      </div>
      <div className="max-h-80 overflow-y-auto bg-white p-2 text-ink dark:bg-night-3 dark:text-cream">
        {open === SUMMARY_TAB ? (
          <div className="space-y-3">
            <div className="grid gap-1.5 sm:grid-cols-2">
              {spec.inputs.map((i) => (
                <div key={i.label} className="flex justify-between rounded-lg px-2 py-1 text-sm ring-2" style={{ ["--tw-ring-color" as string]: spec.accent }}>
                  <span>✏️ {i.label}</span>
                  <b>{formatValue(i.example, i.type, spec.currency)}</b>
                </div>
              ))}
              {values.summary.map((s) => (
                <div key={s.label} className="flex justify-between rounded-lg bg-black/5 px-2 py-1 text-sm dark:bg-white/10">
                  <span>🧮 {s.label}</span>
                  <b>{formatValue(s.value, s.type, spec.currency)}</b>
                </div>
              ))}
            </div>
            {values.goals.map((g) => (
              <div key={g.label} className="text-sm">
                <div className="flex justify-between">
                  <span>🎯 {g.label}</span>
                  <b>{g.value}%</b>
                </div>
                <Bar value={Math.min(100, g.value)} max={100} colour={spec.accent} />
              </div>
            ))}
            {values.breakdowns.map((b) => {
              const max = Math.max(...b.items.map((i) => i.value), 1);
              return (
                <div key={b.title} className="text-xs">
                  <div className="mb-1 font-black">
                    🍩 {b.title} <span className="font-normal opacity-60">({b.chart} chart)</span>
                  </div>
                  {b.items.map((i) => (
                    <div key={i.label} className="grid grid-cols-[7rem_1fr_5rem] items-center gap-2">
                      <span className="truncate">{i.label}</span>
                      <Bar value={i.value} max={max} colour={spec.accent} />
                      <span className="text-right tabular-nums">{formatValue(i.value, typeOf(b.tab, b.sum), spec.currency)}</span>
                    </div>
                  ))}
                </div>
              );
            })}
            {values.trends.map((t) => {
              const max = Math.max(...t.months.flatMap((m) => m.values), 1);
              return (
                <div key={t.title} className="text-xs">
                  <div className="mb-1 font-black">
                    📊 {t.title} <span className="font-normal opacity-60">({t.chart} chart: {t.series.join(" vs ")})</span>
                  </div>
                  <div className="flex h-20 items-end gap-1">
                    {t.months.map((m) => (
                      <div key={m.month} className="flex flex-1 flex-col items-center gap-0.5">
                        <div className="flex h-16 w-full items-end justify-center gap-px">
                          {m.values.map((v, j) => (
                            <span key={j} className="w-full rounded-t" style={{ height: `${(Math.abs(v) / max) * 100}%`, background: j ? "#e9a96b" : spec.accent }} />
                          ))}
                        </div>
                        <span className="text-[9px] opacity-70">{m.month}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : open === SETTINGS_TAB ? (
          <div className="flex flex-wrap gap-3 text-xs">
            {spec.lists.map((l) => (
              <div key={l.name} className="min-w-32">
                <div className="mb-1 rounded px-2 py-0.5 font-black text-white" style={{ background: spec.accent }}>
                  {l.name}
                </div>
                <ul className="space-y-0.5 px-2">
                  {l.items.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                  <li className="opacity-50">+ spare rows to add your own</li>
                </ul>
              </div>
            ))}
          </div>
        ) : tabIndex >= 0 ? (
          <div className="overflow-x-auto">
            {spec.tabs[tabIndex].repeat === "months" && <p className="mb-1 text-xs font-bold">📅 12 tabs, Jan to Dec. January shown:</p>}
            <table className="w-full text-xs">
              <thead>
                <tr>
                  {spec.tabs[tabIndex].columns.map((c) => (
                    <th key={c.header} className="whitespace-nowrap border border-black/10 px-1.5 py-1 text-left font-black dark:border-white/10" title={c.formula ? `Works out: ${c.formula}` : c.type}>
                      {c.header}
                      {c.formula ? " 🧮" : c.type === "checkbox" ? " ☑️" : c.type === "choice" ? " ▾" : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {values.tabs[tabIndex].rows.map((r, k) => (
                  <tr key={k}>
                    {spec.tabs[tabIndex].columns.map((c, i) => (
                      <td key={c.header} className={`whitespace-nowrap border border-black/10 px-1.5 py-1 dark:border-white/10 ${c.formula ? "bg-black/5 font-bold dark:bg-white/10" : ""}`}>
                        {formatValue(r[i], c.type, spec.currency)}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <td colSpan={spec.tabs[tabIndex].columns.length} className="px-1.5 py-1 text-center text-[11px] text-cocoa dark:text-stone-400">
                    + {spec.tabs[tabIndex].blankRows} empty rows ready to fill in
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
      <div className="flex gap-1 overflow-x-auto bg-black/5 p-1 dark:bg-white/5" role="tablist">
        {tabs.map((t) => {
          const monthly = spec.tabs.find((x) => x.name === t)?.repeat === "months";
          return (
            <button
              key={t}
              role="tab"
              aria-selected={open === t}
              onClick={() => setOpen(t)}
              className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-bold ${open === t ? "bg-white shadow dark:bg-night-2" : "opacity-70"}`}
            >
              {monthly ? `${t} ×12` : t}
            </button>
          );
        })}
        <span className="shrink-0 px-2 py-0.5 text-xs opacity-60">+ How to use</span>
      </div>
    </div>
  );
}
