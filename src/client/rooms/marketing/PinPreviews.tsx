// Pin images for one product, drawn on this device, each with a Download button.
import { useEffect, useState } from "react";
import { buildPins, loadPinPhotos, pinFileName, PIN_LAYOUTS } from "../../lib/pins";
import { ErrorNote, Spinner } from "../../components/ui";
import type { PromoProduct } from "./types";

interface Made {
  label: string;
  url: string;
}

export function PinPreviews({ product }: { product: PromoProduct }) {
  const [pins, setPins] = useState<Made[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const title = product.title;
  const imagesKey = product.images.join("|");

  useEffect(() => {
    let alive = true;
    const urls: string[] = [];
    setPins(null);
    setError(null);
    (async () => {
      try {
        const photos = await loadPinPhotos(product.images);
        const made = await buildPins({ title, format: product.format, accent: product.accent, photos });
        for (const m of made) urls.push(URL.createObjectURL(m.blob));
        if (alive) setPins(made.map((m, i) => ({ label: m.label, url: urls[i] })));
      } catch (e) {
        if (alive) setError(e);
      }
    })();
    return () => {
      alive = false;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, imagesKey, product.format, product.accent]);

  if (error) return <ErrorNote error={error} />;
  if (!pins)
    return (
      <div className="grid grid-cols-3 gap-3">
        {PIN_LAYOUTS.map((l) => (
          <div key={l.id} className="flex aspect-[2/3] items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-xs text-zinc-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-400">
            <Spinner />
          </div>
        ))}
      </div>
    );
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-zoom-group="">
      {pins.map((p, i) => (
        <figure key={p.label} className="space-y-1.5">
          <img src={p.url} alt={`Pin ${i + 1}: ${p.label}`} className="aspect-[2/3] w-full cursor-zoom-in rounded-lg border border-zinc-200 object-cover dark:border-white/10" data-zoom="" />
          <figcaption className="flex items-center justify-between gap-2">
            <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">{p.label}</span>
            <a className="btn-soft shrink-0 px-2.5 py-1 text-xs" href={p.url} download={pinFileName(title, i + 1)}>
              Download
            </a>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
