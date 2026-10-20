// Printer puts the bundle together on your device (one ZIP + photos), then you approve it.
import { useState } from "react";
import type { ReviewDef } from "../shared/types";
import { ArtImage } from "../../components/ArtImage";
import { FormatBadge } from "../../components/FormatBadge";
import { ErrorNote, ProgressBar } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { formatGBP, plain } from "../../lib/format";
import type { BundlePack } from "../../lib/bundle";
import { separatePrice, type BundleSpec } from "../../../shared/bundle";

export const bundleReview: ReviewDef = {
  approveLabel: "Bundle looks good → Listing",
  rejectLabel: "Rebuild",
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
        setData({ zipKey: p.zipKey, files: p.files, previews: p.previews, deliverables: p.deliverables });
        setReady(true);
      } catch (e) {
        setError(e);
        setStep(null);
      }
    };

    return (
      <div className="space-y-3">
        <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 text-sm dark:divide-white/[0.06] dark:border-white/10">
          {bundle.items.map((i) => (
            <li key={i.id} className="flex items-center gap-2 px-3 py-2">
              <FormatBadge format={i.format} />
              <span className="min-w-0 flex-1 truncate font-medium">{i.title}</span>
              <span className="text-zinc-600 tabular-nums dark:text-zinc-400">{formatGBP(i.pricePence)}</span>
            </li>
          ))}
          <li className="flex justify-between bg-zinc-50 px-3 py-2 font-semibold dark:bg-white/[0.03]">
            <span>Separately</span>
            <span className="tabular-nums">{formatGBP(separatePrice(bundle.items))}</span>
          </li>
        </ul>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          Printer puts every product's files into <b>one ZIP</b> (a folder each, plus a read-me) and draws <b>the bundle's listing photos</b> on your device. Pricer then sets a price about{" "}
          <b>{bundle.savePercent}% below</b> buying them separately.
        </p>
        {step && !pack && (
          <div>
            <div className="mb-1.5 text-sm font-medium">{plain(step.label)}</div>
            <ProgressBar value={step.f} label="Building the bundle" />
          </div>
        )}
        {pack ? (
          <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
            <div className="flex items-start gap-2">
              <Icon name="check" size={15} className="mt-0.5 shrink-0" />
              Bundled {pack.files.length} files ({(pack.bytes / 1024).toFixed(0)} KB) and saved them. Approve to send it to the Listing Office.
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {pack.previews.map((k) => (
                <ArtImage key={k} imageKey={k} className="aspect-[4/3] w-full rounded-lg" label="Bundle photo" />
              ))}
            </div>
          </div>
        ) : (
          <button className="btn-primary w-full" onClick={build} disabled={!!step}>
            {step ? "Building… keep this open" : "Build the bundle"}
          </button>
        )}
        <ErrorNote error={error} />
      </div>
    );
  },
};
