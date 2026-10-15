// The copy-paste pack: everything you need to create the Etsy listing by hand.
import type { ReviewDef } from "../shared/types";
import { CopyButton } from "../shared/CopyButton";
import { Mockup } from "../../components/DemoArt";
import { formatGBP } from "../../lib/format";

interface Pack {
  listing?: { title: string; tags: string[]; description: string };
  pricePence: number | null;
  files?: string[];
  zip?: string;
  mockups?: { scene: string; seed: number }[];
}

export const launchReview: ReviewDef = {
  approveLabel: "🚀 I've listed it on Etsy — mark as launched",
  rejectLabel: "🔁 Rebuild pack",
  startsReady: true,
  Body: ({ task }) => {
    const p = task.output as unknown as Pack;
    const l = p.listing ?? { title: task.productTitle, tags: [], description: "" };
    return (
      <div className="space-y-4">
        <p className="rounded-xl bg-honey/20 p-2 text-sm font-semibold">Open Etsy → Shop Manager → Listings → Add a listing, then copy each piece across. Etsy API publishing arrives in Phase 4.</p>
        <Field label={`Title (${l.title.length}/140)`} text={l.title} />
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="label !mb-0">Tags ({l.tags.length}/13)</span>
            <CopyButton text={l.tags.join(", ")} label="Copy tags" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {l.tags.map((t) => (
              <span key={t} className="chip">
                {t}
              </span>
            ))}
          </div>
        </div>
        <Field label="Description" text={l.description} multiline />
        <Field label="Price" text={p.pricePence ? (p.pricePence / 100).toFixed(2) : ""} display={p.pricePence ? formatGBP(p.pricePence) : "—"} />
        <div className="rounded-xl bg-black/5 p-3 text-sm dark:bg-white/5">
          <div className="label">Etsy settings to pick</div>
          <ul className="space-y-0.5">
            <li>• Type: <b>Digital files</b></li>
            <li>• Who made it: <b>I did</b> · What is it: <b>A finished product</b></li>
            <li>• “Designed by”: <b>you (the seller)</b></li>
          </ul>
        </div>
        {p.mockups && (
          <div>
            <div className="label">Listing photos</div>
            <div className="grid grid-cols-2 gap-2">
              {p.mockups.map((m) => (
                <Mockup key={m.scene} scene={m.scene} seed={m.seed} />
              ))}
            </div>
          </div>
        )}
        {p.files && (
          <div>
            <div className="label">Digital files ({p.zip})</div>
            <ul className="text-sm">
              {p.files.map((f) => (
                <li key={f}>📄 {f}</li>
              ))}
            </ul>
            <button className="btn-soft mt-2 text-xs" disabled title="Real files arrive with the Printer in Phase 2">
              ⬇️ Download ZIP (Phase 2)
            </button>
          </div>
        )}
      </div>
    );
  },
};

function Field({ label, text, multiline, display }: { label: string; text: string; multiline?: boolean; display?: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="label !mb-0">{label}</span>
        <CopyButton text={text} />
      </div>
      <div className={`rounded-xl bg-white p-2.5 text-sm ring-1 ring-black/10 dark:bg-night-3 dark:ring-white/10 ${multiline ? "max-h-48 overflow-y-auto whitespace-pre-wrap" : ""}`}>{display ?? text}</div>
    </div>
  );
}
