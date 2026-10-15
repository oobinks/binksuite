import type { ReviewDef } from "../shared/types";
import { ProgressBar } from "../../components/ui";

interface Out {
  niche: string;
  scores: { demand: number; competition: number; aiFit: number; pricePotential: number };
  overall: number;
  keywords: string[];
  summary: string;
}

const LABELS: [keyof Out["scores"], string, string][] = [
  ["demand", "Demand", "📈"],
  ["competition", "Competition (lower is better)", "🥊"],
  ["aiFit", "AI fit", "🤖"],
  ["pricePotential", "Price potential", "💷"],
];

export const researchReview: ReviewDef = {
  approveLabel: "👍 Approve niche → brief",
  rejectLabel: "🔁 Re-score",
  startsReady: true,
  Body: ({ task }) => {
    const o = task.output as unknown as Out;
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-[#e6ecff] text-2xl font-black text-[#3d5bc2]">{o.overall}</div>
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
      </div>
    );
  },
};
