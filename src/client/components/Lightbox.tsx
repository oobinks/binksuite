// Click any product photo (an <img data-zoom>) to see it large, right here: no download.
// Arrows step through the other photos in the same group (the nearest [data-zoom-group],
// or else the same section). Esc, the close button or a click outside closes it.
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Icon } from "./Icon";

interface Shot {
  src: string;
  alt: string;
}

export function Lightbox() {
  const [shots, setShots] = useState<Shot[]>([]);
  const [i, setI] = useState(0);
  const open = shots.length > 0;
  const close = useCallback(() => setShots([]), []);
  const step = useCallback((d: number) => setI((n) => (shots.length ? (n + d + shots.length) % shots.length : 0)), [shots.length]);

  // One listener for the whole app, so every photo marked data-zoom just works.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const img = (e.target as Element | null)?.closest?.("img[data-zoom]") as HTMLImageElement | null;
      if (!img || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      // Don't follow a surrounding link (e.g. a download) or press a surrounding button.
      e.preventDefault();
      e.stopPropagation();
      const scope = img.closest("[data-zoom-group]") ?? img.closest("section") ?? document.body;
      const all = [...scope.querySelectorAll<HTMLImageElement>("img[data-zoom]")].filter((x) => x.currentSrc || x.src);
      const list = (all.length ? all : [img]).map((x) => ({ src: x.dataset.zoom || x.currentSrc || x.src, alt: x.alt }));
      setShots(list);
      setI(Math.max(0, all.indexOf(img)));
    };
    // Places where a click can't be used (e.g. a swipe card) ask with an event instead.
    const onAsk = (e: Event) => {
      const d = (e as CustomEvent<Shot>).detail;
      if (d?.src) (setShots([d]), setI(0));
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener("bs:zoom", onAsk);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("bs:zoom", onAsk);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, step]);

  const shot = shots[i];
  return (
    <AnimatePresence>
      {open && shot && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-zinc-950/85 p-4 backdrop-blur-sm sm:p-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-label="Photo preview"
        >
          <img
            key={shot.src}
            src={shot.src}
            alt={shot.alt}
            className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
            draggable={false}
          />
          <button className="absolute top-3 right-3 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20" onClick={close} aria-label="Close preview">
            <Icon name="close" size={20} />
          </button>
          {shots.length > 1 && (
            <>
              <button
                className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
                onClick={(e) => (e.stopPropagation(), step(-1))}
                aria-label="Previous photo"
              >
                <Icon name="arrowLeft" size={20} />
              </button>
              <button
                className="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
                onClick={(e) => (e.stopPropagation(), step(1))}
                aria-label="Next photo"
              >
                <Icon name="arrowRight" size={20} />
              </button>
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white tabular-nums">
                {i + 1} / {shots.length}
              </div>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
