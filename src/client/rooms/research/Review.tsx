import type { ReviewDef } from "../shared/types";
import { ProgressBar } from "../../components/ui";
import { formatGBP, plain } from "../../lib/format";

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

const LABELS: [keyof Out["scores"], string][] = [
  ["demand", "Demand"],
  ["competition", "Competition (lower is better)"],
  ["aiFit", "AI fit"],
  ["pricePotential", "Price potential"],
];

const VERDICT = {
  go: { text: "Go for it", dot: "bg-emerald-500", tone: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200" },
  maybe: { text: "Maybe, with the right angle", dot: "bg-amber-500", tone: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100" },
  skip: { text: "Skip it", dot: "bg-rose-500", tone: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200" },
};

const isSuggested = (o: unknown) => !!(o as Out | null)?.suggested;

export const researchReview: ReviewDef = {
  approveLabel: (t) => (isSuggested(t.output) ? "Make it → brief" : "Approve niche → brief"),
  rejectLabel: (t) => (isSuggested(t.output) ? "Research again" : "Re-score"),
  dropLabel: "Drop idea",
  startsReady: true,
  Body: ({ task }) => {
    const o = task.output as unknown as Out;
    const v = o.verdict ? VERDICT[o.verdict] : null;
    return (
      <div className="space-y-5">
        {o.suggested && <p className="chip">Your suggestion</p>}
        {v && (
          <div className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium ${v.tone}`}>
            <span className={`h-2 w-2 shrink-0 rounded-full ${v.dot}`} aria-hidden />
            Scout says: {v.text}
          </div>
        )}
        <div className="flex items-center gap-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg border border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-white/[0.03]">
            <span className="text-2xl leading-none font-semibold tracking-tight tabular-nums">{o.overall}</span>
          </div>
          <div className="min-w-0">
            <div className="text-base font-semibold">{o.niche}</div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">{plain(o.summary)}</p>
          </div>
        </div>
        <div className="space-y-3">
          {LABELS.map(([k, label]) => (
            <div key={k}>
              <div className="mb-1 flex justify-between text-sm">
                <span className="text-zinc-700 dark:text-zinc-300">{label}</span>
                <span className="font-medium tabular-nums">{o.scores[k]}/10</span>
              </div>
              <ProgressBar value={o.scores[k] / 10} color={k === "competition" ? "#e11d48" : "#4f46e5"} label={label} />
            </div>
          ))}
        </div>
        {o.reasons && <List title="Why" items={o.reasons} />}
        {o.risks && o.risks.length > 0 && <List title="Watch out for" items={o.risks} />}
        {o.angles && <List title="Angles to try" items={o.angles} />}
        {o.priceRangePence && (
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-white/10 dark:bg-white/[0.03]">
              <div className="label">Similar items sell for</div>
              <span className="font-medium tabular-nums">
                {formatGBP(o.priceRangePence[0])} – {formatGBP(o.priceRangePence[1])}
              </span>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-white/10 dark:bg-white/[0.03]">
              <div className="label">When it sells</div>
              <span className="font-medium">{o.seasonality}</span>
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
        {o.sources && <p className="text-xs text-zinc-500 dark:text-zinc-400">{plain(o.sources)}</p>}
      </div>
    );
  },
};

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="label">{title}</div>
      <ul className="space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
        {items.map((r) => (
          <li key={r} className="flex gap-2">
            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-zinc-400" aria-hidden />
            <span>{plain(r)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
