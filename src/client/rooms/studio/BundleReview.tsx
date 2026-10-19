// 🎁 Printer puts the bundle together on your device (one ZIP + photos), then you approve it.
import { useState } from "react";
import type { ReviewDef } from "../shared/types";
import { ArtImage } from "../../components/ArtImage";
import { FormatBadge } from "../../components/FormatBadge";
import { ErrorNote, ProgressBar } from "../../components/ui";
import { formatGBP } from "../../lib/format";
import type { BundlePack } from "../../lib/bundle";
import { separatePrice, type BundleSpec } from "../../../shared/bundle";

export const bundleReview: ReviewDef = {
  approveLabel: "👍 Bundle looks good → Listing",
  rejectLabel: "🔁 Rebuild",
  Body: ({ task, setReady, setData }) => {
    const bundle = (task.output as { bundle?: BundleSpec } | null)?.bundle;
    const [step, setStep] = useState<{ label: string; f: number } | null>(null);
    const [pack, setPack] = useState<BundlePack | null>(null);
    const [error, setError] = useState<unknown>(null);
    if (!bundle) return <p className="text-sm">Nothing to put together yet.</p>;

    const build = async () => {
      setError(null);
      setPack(null);
      try {
        const { buildBundlePack } = await import("../../lib/bundle");
        const p = await buildBundlePack(task.productId!, task.productTitle, bundle, (label, f) => setStep({ label, f }));
        setPack(p);
        setData({ zipKey: p.zipKey, files: p.files, previews: p.previews });
        setReady(true);
      } catch (e) {
        setError(e);
        setStep(null);
      }
    };

    return (
      <div className="space-y-3">
        <ul className="space-y-1 rounded-xl bg-black/5 p-3 text-sm dark:bg-white/5">
          {bundle.items.map((i) => (
            <li key={i.id} className="flex items-center gap-2">
              <FormatBadge format={i.format} />
              <span className="min-w-0 flex-1 truncate font-bold">{i.title}</span>
              <span className="tabular-nums">{formatGBP(i.pricePence)}</span>
            </li>
          ))}
          <li className="flex justify-between border-t border-black/10 pt-1 font-black dark:border-white/10">
            <span>Separately</span>
            <span>{formatGBP(separatePrice(bundle.items))}</span>
          </li>
        </ul>
        <p className="text-sm">
          Printer puts every product's files into <b>one ZIP</b> (a folder each, plus a read-me) and draws <b>the bundle's listing photos</b> on your device. Pricer then sets a price about{" "}
          <b>{bundle.savePercent}% below</b> buying them separately.
        </p>
        {step && !pack && (
          <div>
            <div className="mb-1 text-sm font-bold">{step.label}</div>
            <ProgressBar value={step.f} label="Building the bundle" />
          </div>
        )}
        {pack ? (
          <div className="space-y-2 rounded-xl bg-emerald-50 p-3 text-sm dark:bg-emerald-900/25">
            <div>
              ✅ Bundled {pack.files.length} files ({(pack.bytes / 1024).toFixed(0)} KB) and saved them. Approve to send it to the Listing Office.
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {pack.previews.map((k) => (
                <ArtImage key={k} imageKey={k} className="aspect-[4/3] w-full rounded-lg" label="Bundle photo" />
              ))}
            </div>
          </div>
        ) : (
          <button className="btn-primary w-full" onClick={build} disabled={!!step}>
            {step ? "Building… keep this open" : "🎁 Build the bundle"}
          </button>
        )}
        <ErrorNote error={error} />
      </div>
    );
  },
};
