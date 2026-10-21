// How each listing-performance verdict looks.
export type Verdict = "new" | "star" | "steady" | "browsed" | "liked" | "hidden" | "off";

export const VERDICT_TONE: Record<Verdict, { dot: string; text: string }> = {
  star: { dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-300" },
  steady: { dot: "bg-teal-500", text: "text-teal-700 dark:text-teal-300" },
  browsed: { dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-300" },
  liked: { dot: "bg-violet-500", text: "text-violet-700 dark:text-violet-300" },
  hidden: { dot: "bg-rose-500", text: "text-rose-700 dark:text-rose-300" },
  new: { dot: "bg-zinc-400", text: "text-zinc-600 dark:text-zinc-400" },
  off: { dot: "bg-zinc-400", text: "text-zinc-600 dark:text-zinc-400" },
};
