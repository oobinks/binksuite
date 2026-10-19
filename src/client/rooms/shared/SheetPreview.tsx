// A quick look at a spreadsheet design: the dashboard, then each tab with its example rows.
import { useState } from "react";
import { formatValue, previewValues, type SheetSpec } from "../../../shared/sheetSpec";

export function SheetPreview({ spec }: { spec: SheetSpec }) {
  const values = previewValues(spec);
  const hasSummary = spec.inputs.length > 0 || spec.summary.length > 0;
  const tabs = [...(hasSummary ? ["Summary"] : []), ...spec.tabs.map((t) => t.name)];
  const [open, setOpen] = useState(tabs[0]);
  const tabIndex = spec.tabs.findIndex((t) => t.name === open);
  return (
    <div className="overflow-hidden rounded-xl ring-1 ring-black/10 dark:ring-white/10">
      <div className="px-3 py-2" style={{ background: spec.accent }}>
        <div className="font-black text-white">{spec.title}</div>
        {spec.subtitle && <div className="text-xs text-white/85">{spec.subtitle}</div>}
      </div>
      <div className="bg-white p-2 text-ink dark:bg-night-3 dark:text-cream">
        {open === "Summary" ? (
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
        ) : tabIndex >= 0 ? (
          <div className="overflow-x-auto">
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
        {tabs.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={open === t}
            onClick={() => setOpen(t)}
            className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-bold ${open === t ? "bg-white shadow dark:bg-night-2" : "opacity-70"}`}
          >
            {t}
          </button>
        ))}
        <span className="shrink-0 px-2 py-0.5 text-xs opacity-60">+ How to use</span>
      </div>
    </div>
  );
}
