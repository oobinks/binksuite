// One product in the pin list: images, pin copy to copy, and a "Pinned" tick.
import type { ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useImageSrc } from "../../lib/files";
import { plain, timeAgo } from "../../lib/format";
import { useUi } from "../../lib/store";
import { ErrorNote, Spinner } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { CopyButton } from "../shared/CopyButton";
import { PinPreviews } from "./PinPreviews";
import { PENDING_TOAST, type PinCopy, type PromoProduct } from "./types";

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900 text-[11px] font-semibold text-white dark:bg-white dark:text-zinc-900">{n}</span>
      {children}
    </h4>
  );
}

export function PinCard({ product, open, onToggle }: { product: PromoProduct; open: boolean; onToggle: () => void }) {
  const qc = useQueryClient();
  const toast = useUi((s) => s.toast);
  const thumb = useImageSrc(product.images[0]);
  const copy = product.pins.copy;
  const waiting = product.pins.pendingRev != null;
  const pinned = !!product.pins.pinnedAt;

  const write = useMutation({
    mutationFn: (rewrite: boolean) => api.post<{ copy: PinCopy | null; pending?: boolean }>(`/marketing/pins/${product.id}`, { rewrite }),
    onSuccess: (r) => {
      toast(r.pending ? PENDING_TOAST : { icon: "", title: "Pin copy ready" });
      qc.invalidateQueries({ queryKey: ["marketing"] });
    },
  });
  const pin = useMutation({
    mutationFn: (v: boolean) => api.post(`/marketing/pins/${product.id}/pinned`, { pinned: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["marketing"] }),
  });

  return (
    <li className="py-1">
      <div className="flex items-center gap-3 px-3 py-2">
        <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-expanded={open}>
          <span className="h-12 w-16 shrink-0 overflow-hidden rounded-md border border-zinc-200 bg-zinc-100 dark:border-white/10 dark:bg-white/5">
            {thumb.data && <img src={thumb.data} alt="" className="h-full w-full object-cover" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{product.title}</span>
            <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
              {product.live && (
                <span className="chip inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden /> Live on Etsy
                </span>
              )}
              {pinned && (
                <span className="chip inline-flex items-center gap-1.5">
                  <Icon name="check" size={12} className="text-emerald-600 dark:text-emerald-400" /> Pinned
                </span>
              )}
              {waiting && (
                <span className="chip inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden /> Waiting for Claude
                </span>
              )}
              {!copy && !waiting && <span className="text-xs text-zinc-500 dark:text-zinc-400">No pin copy yet</span>}
            </span>
          </span>
          <Icon name="chevronRight" size={16} className={`shrink-0 text-zinc-400 transition-transform ${open ? "rotate-90" : ""}`} />
        </button>
      </div>

      {open && (
        <div className="space-y-5 px-3 pb-4 pt-2">
          <div>
            <Step n={1}>Download a pin picture</Step>
            <PinPreviews product={product} />
          </div>

          <div>
            <Step n={2}>Copy the words</Step>
            {!copy ? (
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                <p className="mb-2 text-sm text-zinc-700 dark:text-zinc-300">
                  {waiting ? "On Claude's to-do list. The words appear here when Claude's session finishes." : "Promoter writes 3 title options, a description and board ideas."}
                </p>
                <button className="btn-primary px-3 py-1.5 text-sm" onClick={() => write.mutate(false)} disabled={write.isPending || waiting}>
                  {write.isPending ? <Spinner /> : <Icon name="sparkles" size={14} />} Write pin copy
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <div className="label mb-1">Pin title (pick one)</div>
                  <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-white/[0.06] dark:border-white/10">
                    {copy.titles.map((t) => (
                      <li key={t} className="flex items-center gap-3 px-3 py-2 text-sm">
                        <span className="min-w-0 flex-1 text-zinc-800 dark:text-zinc-200">{plain(t)}</span>
                        <span className="shrink-0 text-[11px] tabular-nums text-zinc-400">{t.length}/100</span>
                        <CopyButton text={t} />
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="label">Description</span>
                    <CopyButton text={copy.description} />
                  </div>
                  <p className="whitespace-pre-line rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-300">{plain(copy.description)}</p>
                  <p className="mt-1 text-right text-[11px] tabular-nums text-zinc-400">{copy.description.length}/500</p>
                </div>
                {copy.boards.length > 0 && (
                  <div>
                    <div className="label mb-1">Boards to save it to</div>
                    <div className="flex flex-wrap gap-1.5">
                      {copy.boards.map((b) => (
                        <span key={b} className="chip">
                          {plain(b)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  <span>
                    {copy.real ? "Written by Promoter" : "Simple draft (switch on real AI in Settings for better copy)"} · {timeAgo(copy.at)}
                  </span>
                  <button className="btn-soft px-2.5 py-1 text-xs" onClick={() => write.mutate(true)} disabled={write.isPending || waiting}>
                    <Icon name="refresh" size={13} /> {waiting ? "Waiting for Claude…" : write.isPending ? "Rewriting…" : "Rewrite"}
                  </button>
                </div>
              </div>
            )}
            <div className="mt-2">
              <ErrorNote error={write.error} />
            </div>
          </div>

          <div>
            <Step n={3}>Link it to your listing</Step>
            {product.url ? (
              <div className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-white/10">
                <a href={product.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-accent hover:underline dark:text-indigo-300">
                  {product.url}
                </a>
                <CopyButton text={product.url} label="Copy link" />
              </div>
            ) : (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Once this is live on Etsy, its link shows here. Paste it as the pin's destination link.</p>
            )}
          </div>

          <div>
            <Step n={4}>Add it on Pinterest, then tick it off</Step>
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <input type="checkbox" className="h-4 w-4 accent-[#4f46e5]" checked={pinned} disabled={pin.isPending} onChange={(e) => pin.mutate(e.target.checked)} />
              I've pinned this on Pinterest
              {pinned && <span className="text-xs text-zinc-500 dark:text-zinc-400">({timeAgo(product.pins.pinnedAt!)})</span>}
            </label>
            <ErrorNote error={pin.error} />
          </div>
        </div>
      )}
    </li>
  );
}
