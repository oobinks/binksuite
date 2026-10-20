import { useEffect, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { isStaleBuild, reloadForUpdate } from "../lib/staleBuild";
import { STATUS_LABEL, type AgentStatus } from "../../shared/tasks";
import { Icon } from "./Icon";

export function ProgressBar({ value, color = "#4f46e5", className = "", label }: { value: number; color?: string; className?: string; label?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div
      className={`h-1.5 overflow-hidden rounded-full bg-zinc-200/80 dark:bg-white/10 ${className}`}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <motion.div className="h-full rounded-full" style={{ background: color }} initial={false} animate={{ width: `${pct}%` }} transition={{ duration: 0.6 }} />
    </div>
  );
}

const STATUS_TONE: Record<AgentStatus, { pill: string; dot: string }> = {
  idle: { pill: "text-zinc-600 dark:text-zinc-400", dot: "bg-zinc-400" },
  working: { pill: "text-indigo-700 dark:text-indigo-300", dot: "bg-indigo-500 anim-glow" },
  needs_you: { pill: "text-amber-700 dark:text-amber-300", dot: "bg-amber-500" },
  blocked: { pill: "text-rose-700 dark:text-rose-300", dot: "bg-rose-500" },
  done: { pill: "text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500" },
  off: { pill: "text-zinc-500 dark:text-zinc-500", dot: "bg-zinc-300 dark:bg-zinc-600" },
};

export function StatusPill({ status }: { status: AgentStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-1.5 py-0.5 text-[11px] font-medium dark:border-white/10 dark:bg-white/[0.04] ${STATUS_TONE[status].pill}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_TONE[status].dot}`} aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Modal({ open, onClose, children, title, wide = false }: { open: boolean; onClose: () => void; children: ReactNode; title?: string; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/40 p-0 backdrop-blur-[1px] sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={`card max-h-[92vh] w-full overflow-y-auto rounded-b-none p-5 shadow-xl sm:rounded-xl sm:p-6 ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"}`}
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 12, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
          >
            {title && (
              <div className="mb-4 flex items-start justify-between gap-3">
                <h2 className="text-base font-semibold">{title}</h2>
                <button className="-mr-1.5 -mt-1 rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-white/10 dark:hover:text-white" onClick={onClose} aria-label="Close">
                  <Icon name="close" size={16} />
                </button>
              </div>
            )}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** A titled card. `icon` is accepted for older call sites but emoji icons aren't drawn. */
export function Section({ title, icon, children, right, className = "" }: { title: string; icon?: ReactNode; children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <section className={`card p-4 sm:p-5 ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold">
          {typeof icon === "string" ? null : icon}
          {title}
        </h3>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? "bg-accent dark:bg-indigo-500" : "bg-zinc-300 dark:bg-white/20"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

export function Spinner() {
  return <span className="anim-spin inline-block h-3.5 w-3.5 rounded-full border-2 border-current border-r-transparent align-[-2px] opacity-70" aria-label="Loading" />;
}

export function ErrorNote({ error }: { error: unknown }) {
  const stale = !!error && isStaleBuild(error);
  useEffect(() => {
    if (stale) reloadForUpdate();
  }, [stale]);
  if (!error) return null;
  if (stale) {
    return (
      <p className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-900 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-100">
        BinkSuite was just updated. Reloading to the new version… If nothing happens, refresh the page and try again.
      </p>
    );
  }
  return <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">{error instanceof Error ? error.message : String(error)}</p>;
}
