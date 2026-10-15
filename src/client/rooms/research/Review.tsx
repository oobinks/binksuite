import type { ReviewDef } from "../shared/types";
import { ProgressBar } from "../../components/ui";
import { formatGBP } from "../../lib/format";

interface Out {
  niche: string;
  scores: { demand: number; competition: number; aiFit: number; pricePotential: number };
  overall: number;
  keywords: string[];
  summary: string;
  // Present when the idea came from your Suggestion box:
  suggested?: boolean;
  verdict?: "go" | "maybe" | "skip";
  reasons?: string[];
  risks?: string[];
  angles?: string[];
  priceRangePence?: [number, number];
  seasonality?: string;
  sources?: string;
}

const LABELS: [keyof Out["scores"], string, string][] = [
  ["demand", "Demand", "📈"],
  ["competition", "Competition (lower is better)", "🥊"],
  ["aiFit", "AI fit", "🤖"],
  ["pricePotential", "Price potential", "💷"],
];

const VERDICT = {
  go: { icon: "✅", text: "Go for it", tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200" },
  maybe: { icon: "🤔", text: "Maybe, with the right angle", tone: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200" },
  skip: { icon: "⛔", text: "Skip it", tone: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-200" },
};

const isSuggested = (o: unknown) => !!(o as Out | null)?.suggested;

export const researchReview: ReviewDef = {
  approveLabel: (t) => (isSuggested(t.output) ? "👍 Make it → brief" : "👍 Approve niche → brief"),
  rejectLabel: (t) => (isSuggested(t.output) ? "🔁 Research again" : "🔁 Re-score"),
  dropLabel: "🗑️ Drop idea",
  startsReady: true,
  Body: ({ task }) => {
    const o = task.output as unknown as Out;
    const v = o.verdict ? VERDICT[o.verdict] : null;
    return (
      <div className="space-y-4">
        {o.suggested && <p className="chip bg-honey/25">💡 Your suggestion</p>}
        {v && (
          <div className={`rounded-xl p-3 text-lg font-black ${v.tone}`}>
            {v.icon} Scout says: {v.text}
          </div>
        )}
        <div className="flex items-center gap-3">
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-[#e6ecff] text-2xl font-black text-[#3d5bc2]">{o.overall}</div>
          <div>
            <div className="text-lg font-black">{o.niche}</div>
            <p className="text-sm text-cocoa dark:text-stone-400">{o.summary}</p>
          </div>
        </div>
        <div className="space-y-2">
          {LABELS.map(([k, label, icon]) => (
            <div key={k}>
              <div className="flex justify-between text-sm font-bold">
                <span>
                  {icon} {label}
                </span>
                <span>{o.scores[k]}/10</span>
              </div>
              <ProgressBar value={o.scores[k] / 10} color={k === "competition" ? "#e0607e" : "#7c9cf5"} label={label} />
            </div>
          ))}
        </div>
        {o.reasons && <List title="Why" icon="🔎" items={o.reasons} />}
        {o.risks && o.risks.length > 0 && <List title="Watch out for" icon="⚠️" items={o.risks} />}
        {o.angles && <List title="Angles to try" icon="✨" items={o.angles} />}
        {o.priceRangePence && (
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl bg-black/5 p-2 dark:bg-white/5">
              <div className="label">Similar items sell for</div>
              <b>
                {formatGBP(o.priceRangePence[0])} – {formatGBP(o.priceRangePence[1])}
              </b>
            </div>
            <div className="rounded-xl bg-black/5 p-2 dark:bg-white/5">
              <div className="label">When it sells</div>
              <b>{o.seasonality}</b>
            </div>
          </div>
        )}
        <div>
          <div className="label">Keywords</div>
          <div className="flex flex-wrap gap-1.5">
            {o.keywords.map((k) => (
              <span key={k} className="chip">
                {k}
              </span>
            ))}
          </div>
        </div>
        {o.sources && <p className="text-xs text-cocoa dark:text-stone-400">ℹ️ {o.sources}</p>}
      </div>
    );
  },
};

function List({ title, icon, items }: { title: string; icon: string; items: string[] }) {
  return (
    <div>
      <div className="label">
        {icon} {title}
      </div>
      <ul className="space-y-1 text-sm">
        {items.map((r) => (
          <li key={r}>• {r}</li>
        ))}
      </ul>
    </div>
  );
}
