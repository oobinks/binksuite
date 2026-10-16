// Printer: builds the real print pack on your device, then you approve it.
import { useEffect, useState } from "react";
import type { ReviewDef } from "../shared/types";
import { ArtImage } from "../../components/ArtImage";
import { ErrorNote, ProgressBar } from "../../components/ui";
import { pixelsFor, PRINT_SIZES } from "../../lib/printSizes";
import type { PrintPack } from "../../lib/print";

export const printReview: ReviewDef = {
  approveLabel: "👍 Files look good → Mockups",
  rejectLabel: "🔁 Start again",
  Body: ({ task, setReady, setData }) => {
    const out = task.output as { images?: string[]; files?: { name: string }[] } | null;
    const keys = out?.images ?? [];
    const [step, setStep] = useState<{ label: string; f: number } | null>(null);
    const [pack, setPack] = useState<PrintPack | null>(null);
    const [error, setError] = useState<unknown>(null);

    // Demo products already "have" files.
    useEffect(() => {
      if (task.demo) setReady(true);
    }, [task.demo, setReady]);
    if (task.demo) return <p className="text-sm">Demo print files are ready.</p>;

    const build = async () => {
      setError(null);
      setPack(null);
      try {
        const { buildPrintPack } = await import("../../lib/print"); // PDF + ZIP tools load only when needed
        const p = await buildPrintPack(task.productId!, task.productTitle, keys, (label, f) => setStep({ label, f }));
        setPack(p);
        setData({ zipKey: p.zipKey, files: p.files });
        setReady(true);
      } catch (e) {
        setError(e);
        setStep(null);
      }
    };

    return (
      <div className="space-y-3">
        <p className="text-sm">
          Printer will enlarge your {keys.length} kept image{keys.length === 1 ? "" : "s"} to print sizes and make a PDF for each size. This runs on <b>your device</b> (it's
          free), takes about a minute, and the ZIP is saved to your storage.
        </p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {keys.map((k) => (
            <ArtImage key={k} imageKey={k} className="h-24 w-24 shrink-0 rounded-lg" />
          ))}
        </div>
        <ul className="grid grid-cols-2 gap-1 text-xs sm:grid-cols-3">
          {PRINT_SIZES.map((s) => {
            const px = pixelsFor(s);
            return (
              <li key={s.name} className="chip justify-between">
                <b>{s.name}</b> {px.w}×{px.h} · {px.dpi} DPI
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-cocoa dark:text-stone-400">
          The free AI makes 1024-pixel images, so big sizes are enlarged and look a little soft up close. That's fine for painterly styles; for crisp line art, pick a paid image
          maker later.
        </p>
        {step && !pack && (
          <div>
            <div className="mb-1 text-sm font-bold">{step.label}</div>
            <ProgressBar value={step.f} label="Building print files" />
          </div>
        )}
        {pack ? (
          <div className="rounded-xl bg-emerald-50 p-3 text-sm dark:bg-emerald-900/25">
            ✅ Built {pack.files.length} files ({(pack.bytes / 1024 / 1024).toFixed(1)} MB) and saved them. Approve to send the product to Mockups.
          </div>
        ) : (
          <button className="btn-primary w-full" onClick={build} disabled={!!step}>
            {step ? "Building… keep this open" : "🖨️ Build print files"}
          </button>
        )}
        <ErrorNote error={error} />
      </div>
    );
  },
};
