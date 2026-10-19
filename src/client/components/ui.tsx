import { useEffect, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { isStaleBuild, reloadForUpdate } from "../lib/staleBuild";
import { STATUS_EMOJI, STATUS_LABEL, type AgentStatus } from "../../shared/tasks";

export function ProgressBar({ value, color = "#f2b35b", className = "", label }: { value: number; color?: string; className?: string; label?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div
      className={`h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10 ${className}`}
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

const STATUS_TONE: Record<AgentStatus, string> = {
  idle: "bg-stone-200 text-stone-600 dark:bg-white/10 dark:text-stone-300",
  working: "bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-200",
  needs_you: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
  blocked: "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-200",
  done: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-200",
  off: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-200",
};

export function StatusPill({ status }: { status: AgentStatus }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_TONE[status]}`}>
      <span aria-hidden>{STATUS_EMOJI[status]}</span>
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
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={`card max-h-[92vh] w-full overflow-y-auto rounded-b-none p-5 sm:rounded-2xl ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"}`}
            initial={{ y: 40, scale: 0.97 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
          >
            {title && (
              <div className="mb-3 flex items-start justify-between gap-3">
                <h2 className="text-lg font-black">{title}</h2>
                <button className="btn-soft -mr-1 -mt-1 px-2 py-1" onClick={onClose} aria-label="Close">
                  ✕
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

export function Section({ title, icon, children, right, className = "" }: { title: string; icon?: string; children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <section className={`card p-4 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-black">
          {icon && <span aria-hidden>{icon}</span>}
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
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? "bg-mint" : "bg-black/20 dark:bg-white/20"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

export function Spinner() {
  return <span className="anim-spin inline-block">🌀</span>;
}

export function ErrorNote({ error }: { error: unknown }) {
  const stale = !!error && isStaleBuild(error);
  useEffect(() => {
    if (stale) reloadForUpdate();
  }, [stale]);
  if (!error) return null;
  if (stale) {
    return (
      <p className="rounded-xl bg-honey/20 px-3 py-2 text-sm font-semibold">
        ✨ BinkSuite was just updated. Reloading to the new version… If nothing happens, refresh the page and try again.
      </p>
    );
  }
  return <p className="rounded-xl bg-berry/10 px-3 py-2 text-sm font-semibold text-berry">{error instanceof Error ? error.message : String(error)}</p>;
}
