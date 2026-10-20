import type { ReactNode } from "react";
import { Link } from "react-router";
import { Icon, type IconName } from "./Icon";

/** The title block at the top of every page. */
export function PageHeader({ title, subtitle, icon, tone, back, crumb, right }: { title: string; subtitle?: ReactNode; icon?: IconName; tone?: string; back?: string; crumb?: string; right?: ReactNode }) {
  return (
    <header className="space-y-3">
      {back && (
        <Link to={back} className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white">
          <Icon name="arrowLeft" size={14} />
          {crumb ?? "Back"}
        </Link>
      )}
      <div className="flex flex-wrap items-start gap-4">
        {icon && (
          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tone ?? "border border-zinc-200 bg-white text-zinc-700 shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-white/10 dark:bg-night-2 dark:text-zinc-200"}`}>
            <Icon name={icon} size={20} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">{subtitle}</p>}
        </div>
        {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
      </div>
    </header>
  );
}
