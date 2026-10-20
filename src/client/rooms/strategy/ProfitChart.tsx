// Weekly net profit for the last 8 weeks (same chart styling as Finance).
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ShopNumbers } from "./types";

const NET = "#10b981";
const LOSS = "#e11d48";

function useIsDark() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.documentElement.classList.contains("dark")));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

export function ProfitChart({ weekly }: { weekly: ShopNumbers["weekly"] }) {
  const dark = useIsDark();
  const ink = dark ? "#a1a1aa" : "#71717a";
  const grid = dark ? "rgba(255,255,255,.08)" : "#e4e4e7";
  const data = weekly.map((w) => ({
    week: new Date(w.weekStart + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }),
    Net: w.netPence / 100,
  }));
  const tooltip = {
    formatter: (v: unknown) => [`£${Number(v).toFixed(2)}`, "Net profit"],
    labelFormatter: (l: unknown) => `Week starting ${l}`,
    contentStyle: { borderRadius: 8, border: `1px solid ${dark ? "rgba(255,255,255,.1)" : "#e4e4e7"}`, boxShadow: "0 4px 12px rgba(16,24,40,.08)", fontSize: 12, background: dark ? "#18181b" : "#fff", color: dark ? "#f4f4f5" : "#18181b" },
    cursor: { fill: dark ? "rgba(255,255,255,.04)" : "#f4f4f5" },
  };
  const axis = { tick: { fill: ink, fontSize: 11 }, axisLine: false, tickLine: false } as const;
  return (
    <div className="h-56">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={grid} />
          <XAxis dataKey="week" {...axis} />
          <YAxis {...axis} tickFormatter={(v) => `£${v}`} width={52} />
          <Tooltip {...tooltip} />
          <Bar dataKey="Net" radius={[4, 4, 0, 0]} maxBarSize={36}>
            {data.map((d) => (
              <Cell key={d.week} fill={d.Net >= 0 ? NET : LOSS} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
