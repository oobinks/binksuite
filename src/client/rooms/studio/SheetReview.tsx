// Printer builds the spreadsheet / printable tracker on your device, then you approve it.
import { useState } from "react";
import type { ReviewDef } from "../shared/types";
import { ArtImage } from "../../components/ArtImage";
import { ErrorNote, ProgressBar } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { plain } from "../../lib/format";
import { SheetPreview } from "../shared/SheetPreview";
import type { SheetPack } from "../../lib/sheet";
import type { ProductFormat } from "../../../shared/format";
import type { SheetSpec } from "../../../shared/sheetSpec";

interface Out {
  format: ProductFormat;
  sheet: SheetSpec;
  checks?: string[];
  included?: string;
  review?: { score: number; scores: Record<string, number>; fixes: string[] };
}

export const sheetReview: ReviewDef = {
  approveLabel: "Files look good → Listing",
  rejectLabel: "Redesign (say what to change in the note)",
  Body: ({ task, setReady, setData }) => {
    const o = task.output as unknown as Out;
    const [step, setStep] = useState<{ label: string; f: number } | null>(null);
    const [pack, setPack] = useState<SheetPack | null>(null);
    const [error, setError] = useState<unknown>(null);
    if (!o?.sheet) return <p className="text-sm">No design to build yet.</p>;

    const build = async () => {
      setError(null);
      setPack(null);
      try {
        const { buildSheetPack } = await import("../../lib/sheet"); // Excel + PDF tools load only when needed
        const p = await buildSheetPack(task.productId!, o.sheet, o.format, (label, f) => setStep({ label, f }));
        setPack(p);
        setData({ zipKey: p.zipKey, files: p.files, previews: p.previews, screens: p.screens, deliverables: p.deliverables });
        setReady(true);
      } catch (e) {
        setError(e);
        setStep(null);
      }
    };

    return (
      <div className="space-y-3">
        {o.included && <p className="text-sm text-zinc-700 dark:text-zinc-300">{plain(o.included)}</p>}
        {o.review && (
          <details className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-white/10 dark:bg-white/[0.03]">
            <summary className="cursor-pointer font-medium">
              Senior designer review: scored {o.review.score}/10, then {o.review.fixes.length} improvement{o.review.fixes.length === 1 ? "" : "s"} made
            </summary>
            <div className="mt-2 flex flex-wrap gap-1">
              {Object.entries(o.review.scores).map(([k, v]) => (
                <span key={k} className="chip inline-flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${v >= 9 ? "bg-emerald-500" : v >= 7 ? "bg-amber-500" : "bg-rose-500"}`} aria-hidden />
                  {k} <span className="tabular-nums">{v}</span>
                </span>
              ))}
            </div>
            <ul className="mt-2 space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
              {o.review.fixes.map((f) => (
                <li key={f} className="flex items-start gap-1.5">
                  <Icon name="check" size={12} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  {plain(f)}
                </li>
              ))}
            </ul>
          </details>
        )}
        <SheetPreview spec={o.sheet} />
        {!!o.checks?.length && (
          <details className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs dark:border-white/10 dark:bg-white/[0.03]">
            <summary className="cursor-pointer font-medium">Printer tidied {o.checks.length} thing{o.checks.length === 1 ? "" : "s"} in the design so every formula works</summary>
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-zinc-600 dark:text-zinc-400">
              {o.checks.map((c) => (
                <li key={c}>{plain(c)}</li>
              ))}
            </ul>
          </details>
        )}
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          Printer builds {o.format === "excel" ? <b>the Excel file, a printable PDF</b> : <b>the printable PDF</b>} (A4 and US Letter) and <b>a full set of {o.format === "excel" ? 8 : 7} listing photos</b> on your device. It's
          free and takes a few seconds.
        </p>
        {step && !pack && (
          <div>
            <div className="mb-1.5 text-sm font-medium">{plain(step.label)}</div>
            <ProgressBar value={step.f} label="Building files" />
          </div>
        )}
        {pack ? (
          <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
            <div className="flex items-start gap-2">
              <Icon name="check" size={15} className="mt-0.5 shrink-0" />
              Built {pack.files.length} files ({(pack.bytes / 1024).toFixed(0)} KB) and saved them. Approve to send it to the Listing Office. These are your listing photos.
            </div>
            <ul className="space-y-0.5 font-mono text-xs">
              {pack.files.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {pack.previews.map((k) => (
                <ArtImage key={k} imageKey={k} className="aspect-[4/3] w-full rounded-lg" label="Listing preview" />
              ))}
            </div>
          </div>
        ) : (
          <button className="btn-primary w-full" onClick={build} disabled={!!step}>
            {step ? "Building… keep this open" : o.format === "excel" ? "Build the spreadsheet + PDF" : "Build the printable PDF"}
          </button>
        )}
        <ErrorNote error={error} />
      </div>
    );
  },
};
