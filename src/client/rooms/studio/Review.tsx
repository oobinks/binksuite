// The Inspector's swipeable card stack: swipe right to keep, left to reject.
import { useEffect, useState } from "react";
import { AnimatePresence, motion, type PanInfo } from "motion/react";
import type { ReviewDef } from "../shared/types";
import { ArtImage } from "../../components/ArtImage";

interface Img {
  /** Real art lives in R2 under `key`; demo art is drawn from `seed`. */
  key?: string;
  seed?: number;
  score: number | null;
  issues: string[];
  prompt?: string;
}

const idOf = (im: Img) => im.key ?? String(im.seed);

export const studioReview: ReviewDef = {
  approveLabel: "👍 Approve kept art → Printer",
  rejectLabel: "🎨 Regenerate all",
  Body: ({ task, setReady, setData }) => {
    const { images, note } = task.output as { images: Img[]; note?: string };
    const [i, setI] = useState(0);
    const [verdicts, setVerdicts] = useState<Record<string, boolean>>({});
    useEffect(() => {
      setReady(i >= images.length && Object.values(verdicts).some(Boolean));
      setData({ kept: images.filter((im) => im.key && verdicts[idOf(im)]).map((im) => im.key) });
    }, [i, images, verdicts, setReady, setData]);
    const decide = (keep: boolean) => {
      setVerdicts((v) => ({ ...v, [idOf(images[i])]: keep }));
      setI((n) => n + 1);
    };
    const onDragEnd = (_: unknown, info: PanInfo) => {
      if (info.offset.x > 90) decide(true);
      else if (info.offset.x < -90) decide(false);
    };
    const current = images[i];
    return (
      <div className="space-y-3">
        <p className="text-sm text-cocoa dark:text-stone-400">
          {note ?? `Inspector checked ${images.length} images.`} Swipe right (or tap 👍) to keep, left to bin. Card {Math.min(i + 1, images.length)} of {images.length}.
        </p>
        <div className="relative mx-auto h-[300px] w-[230px]">
          <AnimatePresence>
            {current ? (
              <motion.div
                key={idOf(current)}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.9}
                onDragEnd={onDragEnd}
                initial={{ scale: 0.9, opacity: 0, y: 10 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: verdicts[idOf(current)] ? 200 : -200, rotate: verdicts[idOf(current)] ? 15 : -15 }}
                whileDrag={{ rotate: 4 }}
                className="card absolute inset-0 cursor-grab touch-pan-y overflow-hidden p-2 active:cursor-grabbing"
              >
                <ArtImage imageKey={current.key} seed={current.seed} className="pointer-events-none h-[220px] w-full rounded-lg" />
                <div className="mt-2 flex items-center justify-between text-sm font-bold">
                  <span>{current.score == null ? "Your call 👀" : `Score ${current.score}/10`}</span>
                  {current.issues.length ? (
                    <span className="chip bg-amber-100 text-amber-800">⚠️ flagged</span>
                  ) : current.score == null ? null : (
                    <span className="chip bg-emerald-100 text-emerald-700">✓ clean</span>
                  )}
                </div>
                {current.issues.map((x) => (
                  <p key={x} className="text-xs text-amber-700 dark:text-amber-300">
                    {x}
                  </p>
                ))}
              </motion.div>
            ) : (
              <div className="grid h-full place-items-center text-center">
                <div>
                  <div className="text-5xl">🗂️</div>
                  <p className="font-bold">All reviewed!</p>
                  <p className="text-sm">Kept {Object.values(verdicts).filter(Boolean).length} of {images.length}.</p>
                  <button className="btn-soft mt-2 text-xs" onClick={() => { setI(0); setVerdicts({}); }}>
                    Start over
                  </button>
                </div>
              </div>
            )}
          </AnimatePresence>
        </div>
        {current && (
          <div className="flex justify-center gap-3">
            <button className="btn-bad px-5 text-lg" onClick={() => decide(false)} aria-label="Reject image">
              👎
            </button>
            <button className="btn-good px-5 text-lg" onClick={() => decide(true)} aria-label="Keep image">
              👍
            </button>
          </div>
        )}
        <div className="flex justify-center gap-1.5">
          {images.map((im) => (
            <span key={idOf(im)} className={`h-2 w-2 rounded-full ${idOf(im) in verdicts ? (verdicts[idOf(im)] ? "bg-mint" : "bg-berry") : "bg-black/15 dark:bg-white/20"}`} />
          ))}
        </div>
      </div>
    );
  },
};
