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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { api } from "../../lib/api";
import { ErrorNote } from "../../components/ui";
import { Icon } from "../../components/Icon";

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
  approveLabel: "I've listed it on Etsy — mark as launched",
  rejectLabel: "Rebuild pack",
  startsReady: true,
  Body: ({ task }) => {
    const p = task.output as unknown as Pack;
    const l = p.listing ?? { title: task.productTitle, tags: [], description: "" };
    return (
      <div className="space-y-4">
        {task.productId && <SendToEtsy productId={task.productId} />}
        {p.bundle && (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-white/10 dark:bg-white/[0.03]">
            <div className="font-semibold">
              Bundle of {p.bundle.items.length}: buyers save {p.bundle.savePercent}% ({formatGBP(p.bundle.separatePence)} separately)
            </div>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">The description says so. Keep these listings live at their current prices so the saving stays true: {p.bundle.items.map((i) => `${i.title} (${formatGBP(i.pricePence)})`).join(", ")}.</p>
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
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-300">
          <div className="label">Etsy settings to pick</div>
          <ul className="list-disc space-y-0.5 pl-5 marker:text-zinc-400">
            <li>Type: <span className="font-medium">Digital files</span></li>
            <li>Who made it: <span className="font-medium">I did</span> · What is it: <span className="font-medium">A finished product</span></li>
            <li>“Designed by”: <span className="font-medium">you (the seller)</span></li>
          </ul>
        </div>
        {p.images && p.images.length > 0 && (
          <div>
            <div className="label">{task.productFormat === "art" ? "Your art (use as listing photos)" : `Listing photos (${p.images.length}): upload them to Etsy in this order`}</div>
            <div className="flex flex-wrap gap-2">
              {p.images.map((k, i) => (
                <button key={k} className="group relative" onClick={() => downloadImage(k, `${task.productFormat === "art" ? "art" : "listing-photo"}-${i + 1}.jpg`)} title="Download">
                  <ArtImage imageKey={k} className="h-20 w-20 rounded-lg border border-zinc-200 dark:border-white/10" />
                  <span className="absolute inset-x-0 bottom-0 rounded-b-lg bg-zinc-950/60 py-0.5 text-[10px] font-medium text-white opacity-0 transition group-hover:opacity-100">Save</span>
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
            <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 text-sm dark:divide-white/[0.06] dark:border-white/10">
              {p.files.map((f) => (
                <li key={f} className="px-3 py-1.5 font-mono text-xs text-zinc-700 dark:text-zinc-300">{f}</li>
              ))}
            </ul>
            {p.zipKey ? (
              <a className="btn-primary mt-2 text-xs" href={fileUrl(p.zipKey, p.zip)} download>
                Download print pack (ZIP)
              </a>
            ) : (
              <button className="btn-soft mt-2 text-xs" disabled title="Demo products have no real files">
                Download ZIP (demo)
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
      <div className={`rounded-lg border border-zinc-200 bg-white p-2.5 text-sm text-zinc-800 dark:border-white/10 dark:bg-night-3 dark:text-zinc-200 ${multiline ? "max-h-48 overflow-y-auto whitespace-pre-wrap" : ""}`}>{display ?? text}</div>
    </div>
  );
}

/** How Etsy-ready the words are, and the searches they were written for. */
function ListingCheck({ listing, research }: { listing: { title: string; tags: string[]; description: string }; research?: KeywordResearch }) {
  const { score, checks } = seoCheck(listing, research);
  const tagSet = new Set(listing.tags);
  const dot = score >= 80 ? "bg-emerald-500" : score >= 60 ? "bg-amber-500" : "bg-rose-500";
  return (
    <details className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-white/10 dark:bg-white/[0.03]">
      <summary className="flex cursor-pointer items-center justify-between gap-2 font-semibold">
        <span className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
          Listing check: <span className="tabular-nums">{score}%</span>
        </span>
        <span className="text-xs font-normal text-zinc-500 tabular-nums dark:text-zinc-400">{checks.filter((c) => c.pass).length}/{checks.length} passed · details</span>
      </summary>
      <ul className="mt-3 space-y-1.5">
        {checks.map((c) => (
          <li key={c.key} className="flex items-start gap-2">
            <span className={`mt-0.5 shrink-0 ${c.pass ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
              <Icon name={c.pass ? "check" : "alert"} size={14} />
            </span>
            <div className="min-w-0">
              <span className="font-medium">{c.label}</span>
              {!c.pass && <div className="text-xs text-zinc-500 dark:text-zinc-400">{c.tip}</div>}
            </div>
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
              <span key={p.phrase} className={`chip inline-flex items-center gap-1 ${tagSet.has(p.phrase) ? "border-emerald-300 text-emerald-700 dark:border-emerald-500/40 dark:text-emerald-300" : ""}`} title={p.listings ? `Used by ${p.listings} of the top listings` : undefined}>
                {tagSet.has(p.phrase) && <Icon name="check" size={11} />}
                {p.phrase}
                {p.listings > 0 && <span className="text-zinc-400 tabular-nums"> {p.listings}</span>}
              </span>
            ))}
          </div>
          {research.source === "etsy" && <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">From the listings Etsy shows first (official API). Ticked = in your tags. The number is how many top listings use it.</p>}
        </div>
      )}
    </details>
  );
}

interface EtsyDraft {
  listingId: number;
  editUrl: string;
  at: string;
  photos: number;
  files: string[];
  category: string;
}

/** Send the product to your Etsy shop as a draft; you publish it on Etsy yourself. */
function SendToEtsy({ productId }: { productId: string }) {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ["etsy"], queryFn: () => api.get<{ shop: { shopName: string } | null; apiKey: boolean }>("/etsy") });
  const product = useQuery({ queryKey: ["product", productId], queryFn: () => api.get<{ etsy: EtsyDraft | null; downloads: number }>(`/products/${productId}`) });
  const send = useMutation({
    mutationFn: (again: boolean) => api.post<{ draft: EtsyDraft }>(`/products/${productId}/etsy-draft`, { again }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["product", productId] }),
  });
  const draft = product.data?.etsy;
  if (!status.data) return null;
  if (!status.data.shop)
    return (
      <p className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-100">
        <Link to="/settings#etsy" className="font-medium underline">Connect your Etsy shop</Link> to send this straight to Etsy as a draft. Or copy each piece across below (Etsy → Shop Manager → Listings → Add a listing).
      </p>
    );
  return (
    <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-300">
      {draft ? (
        <>
          <div className="flex items-center gap-1.5 font-semibold text-zinc-900 dark:text-zinc-100">
            <Icon name="check" size={15} className="text-emerald-600 dark:text-emerald-400" />
            Draft on Etsy ({status.data.shop.shopName})
          </div>
          <p>
            {draft.photos} photo{draft.photos === 1 ? "" : "s"} and {draft.files.length} download file{draft.files.length === 1 ? "" : "s"} ({draft.files.join(", ")}), in {draft.category}.
          </p>
          <ol className="list-decimal space-y-0.5 pl-5">
            <li>Open the draft, check everything (and the photos' order).</li>
            <li>
              In Etsy's listing editor, tick the <b>made with AI / designed by</b> details if asked, then press <b>Publish</b>.
            </li>
            <li>Come back and tap “I've listed it on Etsy” below.</li>
          </ol>
          <div className="flex flex-wrap gap-2">
            <a className="btn-primary" href={draft.editUrl} target="_blank" rel="noreferrer">
              Open the draft on Etsy <Icon name="external" size={14} />
            </a>
            <button className="btn-soft text-xs" onClick={() => confirm("Send a second draft to Etsy? (Delete the old one there.)") && send.mutate(true)} disabled={send.isPending}>
              {send.isPending ? "Sending…" : "Send again"}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="font-semibold text-zinc-900 dark:text-zinc-100">Send to {status.data.shop.shopName} as a draft</div>
          <p>
            Creates the listing on Etsy with the title, tags, description, price, listing photos and{" "}
            {product.data?.downloads ? `${product.data.downloads} download file${product.data.downloads === 1 ? "" : "s"}` : "the download ZIP"}. Buyers can't see it until you press Publish on Etsy.
          </p>
          <button className="btn-primary w-full" onClick={() => send.mutate(false)} disabled={send.isPending}>
            {send.isPending ? "Sending to Etsy… (about a minute)" : "Send to Etsy as a draft"}
          </button>
        </>
      )}
      <ErrorNote error={send.error} />
    </div>
  );
}
