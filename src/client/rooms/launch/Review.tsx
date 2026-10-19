// The copy-paste pack: everything you need to create the Etsy listing by hand.
import type { ReviewDef } from "../shared/types";
import { CopyButton } from "../shared/CopyButton";
import { Mockup } from "../../components/DemoArt";
import { PhotoMockup } from "../../components/PhotoMockup";
import type { MockupView } from "../../../shared/mockupScenes";
import { formatGBP } from "../../lib/format";
import { downloadImage, fileUrl } from "../../lib/files";
import { ArtImage } from "../../components/ArtImage";
import { seoCheck, type KeywordResearch } from "../../../shared/seo";

interface Pack {
  listing?: { title: string; tags: string[]; description: string };
  seo?: KeywordResearch;
  bundle?: { items: { id: string; title: string; pricePence: number }[]; separatePence: number; savePercent: number };
  pricePence: number | null;
  files?: string[];
  zip?: string;
  zipKey?: string;
  images?: string[];
  mockups?: MockupView[];
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
        {p.bundle && (
          <div className="rounded-xl bg-honey/20 p-3 text-sm">
            <div className="font-black">
              🎁 Bundle of {p.bundle.items.length}: buyers save {p.bundle.savePercent}% ({formatGBP(p.bundle.separatePence)} separately)
            </div>
            <p className="text-xs">The description says so. Keep these listings live at their current prices so the saving stays true: {p.bundle.items.map((i) => `${i.title} (${formatGBP(i.pricePence)})`).join(", ")}.</p>
          </div>
        )}
        <ListingCheck listing={l} research={p.seo} />
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
            <div className="label">{task.productFormat === "art" ? "Your art (use as listing photos)" : `Listing photos (${p.images.length}): upload them to Etsy in this order`}</div>
            <div className="flex flex-wrap gap-2">
              {p.images.map((k, i) => (
                <button key={k} className="group relative" onClick={() => downloadImage(k, `${task.productFormat === "art" ? "art" : "listing-photo"}-${i + 1}.jpg`)} title="Download">
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
              {p.mockups.map((m, i) =>
                "bgKey" in m ? (
                  <PhotoMockup key={m.scene} view={m} save={`listing-photo-${i + 1}.jpg`} />
                ) : (
                  <Mockup key={m.scene} scene={m.scene} seed={m.seed} imageKey={m.imageKey} slogan={m.slogan} />
                ),
              )}
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

/** 🔎 How Etsy-ready the words are, and the searches they were written for. */
function ListingCheck({ listing, research }: { listing: { title: string; tags: string[]; description: string }; research?: KeywordResearch }) {
  const { score, checks } = seoCheck(listing, research);
  const tagSet = new Set(listing.tags);
  const colour = score >= 80 ? "bg-emerald-100 dark:bg-emerald-900/30" : score >= 60 ? "bg-amber-100 dark:bg-amber-900/30" : "bg-rose-100 dark:bg-rose-900/30";
  return (
    <details className={`rounded-2xl p-3 text-sm ${colour}`}>
      <summary className="flex cursor-pointer items-center justify-between gap-2 font-black">
        <span>🔎 Listing check: {score}%</span>
        <span className="text-xs font-bold opacity-70">{checks.filter((c) => c.pass).length}/{checks.length} ✓ · tap for details</span>
      </summary>
      <ul className="mt-2 space-y-1">
        {checks.map((c) => (
          <li key={c.key}>
            {c.pass ? "✅" : "💡"} <b>{c.label}</b>
            {!c.pass && <div className="ml-6 text-xs text-cocoa dark:text-stone-300">{c.tip}</div>}
          </li>
        ))}
      </ul>
      {research && research.phrases.length > 0 && (
        <div className="mt-3">
          <div className="label">
            {research.source === "etsy"
              ? `What buyers search: “${research.keyword}”${research.competing ? ` (${research.competing.toLocaleString("en-GB")} listings)` : ""}`
              : `Scout's keywords for “${research.keyword}”`}
          </div>
          <div className="flex flex-wrap gap-1">
            {research.phrases.slice(0, 20).map((p) => (
              <span key={p.phrase} className={`chip ${tagSet.has(p.phrase) ? "bg-emerald-200 dark:bg-emerald-800/60" : "bg-white/70 dark:bg-night-3"}`} title={p.listings ? `Used by ${p.listings} of the top listings` : undefined}>
                {tagSet.has(p.phrase) ? "✓ " : ""}
                {p.phrase}
                {p.listings > 0 && <span className="opacity-50"> {p.listings}</span>}
              </span>
            ))}
          </div>
          {research.source === "etsy" && <p className="mt-1 text-xs opacity-70">From the listings Etsy shows first (official API). ✓ = in your tags. The number is how many top listings use it.</p>}
        </div>
      )}
    </details>
  );
}
