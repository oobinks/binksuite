// The copy-paste pack: everything you need to create the Etsy listing by hand.
import type { ReviewDef } from "../shared/types";
import { CopyButton } from "../shared/CopyButton";
import { Mockup } from "../../components/DemoArt";
import { formatGBP } from "../../lib/format";
import { downloadImage, fileUrl } from "../../lib/files";
import { ArtImage } from "../../components/ArtImage";

interface Pack {
  listing?: { title: string; tags: string[]; description: string };
  pricePence: number | null;
  files?: string[];
  zip?: string;
  zipKey?: string;
  images?: string[];
  mockups?: { scene: string; seed: number; imageKey?: string | null }[];
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
        {p.images && p.images.length > 0 && (
          <div>
            <div className="label">Your art (use as listing photos)</div>
            <div className="flex flex-wrap gap-2">
              {p.images.map((k, i) => (
                <button key={k} className="group relative" onClick={() => downloadImage(k, `art-${i + 1}.jpg`)} title="Download">
                  <ArtImage imageKey={k} className="h-20 w-20 rounded-lg" />
                  <span className="absolute inset-x-0 bottom-0 rounded-b-lg bg-black/50 text-[10px] font-bold text-white">⬇️ save</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {p.mockups && (
          <div>
            <div className="label">Listing photos</div>
            <div className="grid grid-cols-2 gap-2">
              {p.mockups.map((m) => (
                <Mockup key={m.scene} scene={m.scene} seed={m.seed} imageKey={m.imageKey} />
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
            {p.zipKey ? (
              <a className="btn-primary mt-2 text-xs" href={fileUrl(p.zipKey, p.zip)} download>
                ⬇️ Download print pack (ZIP)
              </a>
            ) : (
              <button className="btn-soft mt-2 text-xs" disabled title="Demo products have no real files">
                ⬇️ Download ZIP (demo)
              </button>
            )}
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
