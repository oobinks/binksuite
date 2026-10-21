// The Inspector's swipeable card stack: swipe right to keep, left to reject.
import { useEffect, useState } from "react";
import { AnimatePresence, motion, type PanInfo } from "motion/react";
import type { ReviewDef } from "../shared/types";
import { ArtImage } from "../../components/ArtImage";
import { Icon } from "../../components/Icon";
import { plain } from "../../lib/format";

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
  approveLabel: "Approve kept art → Printer",
  rejectLabel: "Regenerate all",
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
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {note ? plain(note) : `Inspector checked ${images.length} images.`} Swipe right (or tap Keep) to keep, left to reject. Card <span className="tabular-nums">{Math.min(i + 1, images.length)}</span> of <span className="tabular-nums">{images.length}</span>.
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
                <ArtImage imageKey={current.key} seed={current.seed} className="pointer-events-none h-[220px] w-full rounded-lg" zoom={false} />
                {current.key && (
                  <button
                    type="button"
                    className="absolute top-4 right-4 grid h-8 w-8 place-items-center rounded-full bg-zinc-950/60 text-white hover:bg-zinc-950/80"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      const img = (e.currentTarget.parentElement?.querySelector("img") as HTMLImageElement | null)?.src;
                      if (img) window.dispatchEvent(new CustomEvent("bs:zoom", { detail: { src: img, alt: "Artwork" } }));
                    }}
                    aria-label="Enlarge"
                    title="Enlarge"
                  >
                    <Icon name="enlarge" size={15} />
                  </button>
                )}
                <div className="mt-2 flex items-center justify-between text-sm font-medium">
                  <span className="tabular-nums">{current.score == null ? "Your call" : `Score ${current.score}/10`}</span>
                  {current.issues.length ? (
                    <span className="chip inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
                      Flagged
                    </span>
                  ) : current.score == null ? null : (
                    <span className="chip inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
                      Clean
                    </span>
                  )}
                </div>
                {current.issues.map((x) => (
                  <p key={x} className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                    {plain(x)}
                  </p>
                ))}
              </motion.div>
            ) : (
              <div className="grid h-full place-items-center text-center">
                <div>
                  <span className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-white/[0.06] dark:text-zinc-400">
                    <Icon name="check" size={18} />
                  </span>
                  <p className="font-semibold">All reviewed</p>
                  <p className="text-sm text-zinc-500 tabular-nums dark:text-zinc-400">Kept {Object.values(verdicts).filter(Boolean).length} of {images.length}.</p>
                  <button className="btn-soft mt-3 px-2.5 py-1 text-xs" onClick={() => { setI(0); setVerdicts({}); }}>
                    Start over
                  </button>
                </div>
              </div>
            )}
          </AnimatePresence>
        </div>
        {current && (
          <div className="flex justify-center gap-3">
            <button className="btn-soft px-4 text-rose-700 dark:text-rose-300" onClick={() => decide(false)} aria-label="Reject image">
              <Icon name="close" size={15} /> Reject
            </button>
            <button className="btn-soft px-4 text-emerald-700 dark:text-emerald-300" onClick={() => decide(true)} aria-label="Keep image">
              <Icon name="check" size={15} /> Keep
            </button>
          </div>
        )}
        <div className="flex justify-center gap-1.5">
          {images.map((im) => (
            <span key={idOf(im)} className={`h-1.5 w-1.5 rounded-full ${idOf(im) in verdicts ? (verdicts[idOf(im)] ? "bg-emerald-500" : "bg-rose-500") : "bg-zinc-300 dark:bg-white/20"}`} />
          ))}
        </div>
      </div>
    );
  },
};
