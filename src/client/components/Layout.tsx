import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { useSnapshot, applyTheme } from "../lib/hooks";
import { useUi } from "../lib/store";
import { formatGBP } from "../lib/format";
import { BUILD_INFO } from "../lib/buildInfo";
import { BUSINESS, GROW, PIPELINE, ROOM_ICON, ROOM_LABEL, ROOM_TONE } from "../lib/rooms";
import type { RoomId } from "../../shared/registry";
import type { Snapshot } from "../../shared/api";
import { Icon, type IconName } from "./Icon";
import { Logo } from "./Logo";
import { ClaudeBar } from "./ClaudeBar";
import { Lightbox } from "./Lightbox";
import { BriefingModal } from "../game/BriefingModal";
import { ApprovalsDrawer } from "../game/ApprovalsDrawer";

export function Layout({ children }: { children: ReactNode }) {
  const { data: snap } = useSnapshot();
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [approvalsOpen, setApprovalsOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const loc = useLocation();

  useEffect(() => {
    if (snap?.settings.theme) applyTheme(snap.settings.theme);
  }, [snap?.settings.theme]);

  // Show the daily briefing once per day, on the dashboard.
  useEffect(() => {
    if (snap?.briefingDue && loc.pathname === "/") setBriefingOpen(true);
  }, [snap?.briefingDue, loc.pathname]);

  useEffect(() => setNavOpen(false), [loc.pathname]);

  return (
    <div className="min-h-dvh pb-[env(safe-area-inset-bottom)] lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-zinc-200/80 bg-white lg:block dark:border-white/[0.07] dark:bg-night-2">
        <Sidebar snap={snap} />
      </aside>

      <AnimatePresence>
        {navOpen && (
          <>
            <motion.div className="fixed inset-0 z-50 bg-zinc-950/40 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setNavOpen(false)} />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] border-r border-zinc-200 bg-white shadow-xl lg:hidden dark:border-white/10 dark:bg-night-2"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <Sidebar snap={snap} onClose={() => setNavOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <header className="sticky top-0 z-30 border-b border-zinc-200/80 bg-white/85 backdrop-blur-md dark:border-white/[0.07] dark:bg-night/85">
        <div className="flex h-14 items-center gap-2 px-3 sm:px-6">
          <button className="rounded-md p-2 text-zinc-600 hover:bg-zinc-100 lg:hidden dark:text-zinc-300 dark:hover:bg-white/10" onClick={() => setNavOpen(true)} aria-label="Open menu">
            <Icon name="menu" size={20} />
          </button>
          <Link to="/" className="flex items-center gap-2 lg:hidden" aria-label="BinkSuite dashboard">
            <Logo size={26} />
            <span className="hidden text-[15px] font-semibold tracking-tight sm:inline">BinkSuite</span>
          </Link>
          {snap?.settings.demoMode && (
            <span className="chip ml-1 border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200" title="Demo mode is on">
              Demo
            </span>
          )}

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            {snap && (
              <>
                <Link
                  to="/room/finance"
                  className="mr-1 hidden items-baseline gap-2 rounded-md px-2.5 py-1.5 hover:bg-zinc-100 sm:flex dark:hover:bg-white/[0.06]"
                  title="Net profit to date"
                >
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">Net profit</span>
                  <span className="text-sm font-semibold tabular-nums" data-testid="coins">
                    {formatGBP(snap.game.coinsPence)}
                  </span>
                </Link>
                <button
                  className="relative inline-flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-sm font-medium hover:bg-zinc-50 dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.08]"
                  onClick={() => setApprovalsOpen(true)}
                  aria-label={`${snap.approvalsWaiting} approvals waiting`}
                >
                  <Icon name="inbox" size={16} className="text-zinc-500 dark:text-zinc-400" />
                  <span className="hidden sm:inline">Approvals</span>
                  {snap.approvalsWaiting > 0 && (
                    <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white tabular-nums dark:bg-indigo-500">
                      {snap.approvalsWaiting}
                    </span>
                  )}
                </button>
              </>
            )}
            <IconButton icon="briefing" label="Daily briefing" onClick={() => setBriefingOpen(true)} className="hidden sm:grid" />
            <IconButton icon="refresh" label="Reload the page" onClick={() => window.location.reload()} />
          </div>
        </div>
        <ClaudeBar provider={snap?.settings.ai.provider} />
        {snap && (!snap.secrets.sessionSecret || !snap.secrets.vaultMasterKey) && (
          <div className="border-t border-rose-200 bg-rose-50 px-4 py-1.5 text-center text-xs font-medium text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
            A Cloudflare secret is missing. Open <Link className="underline" to="/setup">the setup guide</Link>.
          </div>
        )}
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>

      <Toasts />
      <Lightbox />
      <BriefingModal open={briefingOpen} onClose={() => setBriefingOpen(false)} />
      <ApprovalsDrawer open={approvalsOpen} onClose={() => setApprovalsOpen(false)} />
    </div>
  );
}

function IconButton({ icon, label, onClick, className = "" }: { icon: IconName; label: string; onClick: () => void; className?: string }) {
  return (
    <button
      className={`grid h-9 w-9 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white ${className}`}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <Icon name={icon} size={18} />
    </button>
  );
}

function Sidebar({ snap, onClose }: { snap: Snapshot | undefined; onClose?: () => void }) {
  const count = (id: RoomId) => snap?.rooms.find((r) => r.id === id);
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2.5 border-b border-zinc-200/80 px-5 dark:border-white/[0.07]">
        <Link to="/" className="flex items-center gap-2.5" aria-label="BinkSuite dashboard">
          <Logo size={26} />
          <span className="text-[15px] font-semibold tracking-tight">BinkSuite</span>
        </Link>
        <span
          className="rounded border border-zinc-200 px-1 py-px text-[10px] font-medium text-zinc-500 tabular-nums dark:border-white/10 dark:text-zinc-400"
          title={`Version ${BUILD_INFO.version}${BUILD_INFO.change ? `: ${BUILD_INFO.change}` : ""}`}
        >
          v{BUILD_INFO.version}
        </span>
        {onClose && (
          <button className="ml-auto rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10" onClick={onClose} aria-label="Close menu">
            <Icon name="close" size={18} />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5" aria-label="Main">
        <div className="space-y-0.5">
          <NavItem to="/" icon="dashboard" label="Dashboard" end iconClass="text-indigo-500 dark:text-indigo-400" />
        </div>
        <NavGroup title="Pipeline">
          {PIPELINE.map((id) => (
            <NavItem key={id} to={`/room/${id}`} icon={ROOM_ICON[id]} iconClass={ROOM_TONE[id].icon} label={ROOM_LABEL[id]} needs={count(id)?.needsYou} busy={(count(id)?.working ?? 0) > 0} />
          ))}
        </NavGroup>
        <NavGroup title="Business">
          <NavItem to="/shop" icon="store" iconClass="text-emerald-600 dark:text-emerald-400" label="My shop" />
          {BUSINESS.map((id) => (
            <NavItem key={id} to={`/room/${id}`} icon={ROOM_ICON[id]} iconClass={ROOM_TONE[id].icon} label={ROOM_LABEL[id]} needs={count(id)?.needsYou} />
          ))}
        </NavGroup>
        <NavGroup title="Grow">
          {GROW.map((id) => (
            <NavItem key={id} to={`/room/${id}`} icon={ROOM_ICON[id]} iconClass={ROOM_TONE[id].icon} label={ROOM_LABEL[id]} needs={count(id)?.needsYou} />
          ))}
        </NavGroup>
      </nav>

      <div className="space-y-0.5 border-t border-zinc-200/80 px-3 py-3 dark:border-white/[0.07]">
        <NavItem to="/journal" icon="activity" label="Activity" needs={snap?.game.questsReady} />
        <NavItem to="/settings" icon="settings" label="Settings" />
      </div>
    </div>
  );
}

function NavGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 px-2.5 text-[11px] font-semibold tracking-[0.06em] text-zinc-400 uppercase dark:text-zinc-500">{title}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function NavItem({ to, icon, iconClass = "", label, needs = 0, busy = false, muted = false, note, end }: { to: string; icon: IconName; iconClass?: string; label: string; needs?: number; busy?: boolean; muted?: boolean; note?: string; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `group flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-sm transition-colors ${
          isActive
            ? "bg-zinc-100 font-semibold text-zinc-900 dark:bg-white/[0.08] dark:text-white"
            : muted
              ? "text-zinc-400 hover:bg-zinc-50 hover:text-zinc-600 dark:text-zinc-500 dark:hover:bg-white/[0.04]"
              : "font-medium text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/[0.04] dark:hover:text-white"
        }`
      }
    >
      <Icon name={icon} size={17} className={iconClass || "opacity-80"} />
      <span className="flex-1 truncate">{label}</span>
      {busy && !needs && <span className="anim-glow h-1.5 w-1.5 rounded-full bg-accent dark:bg-indigo-400" title="Working" />}
      {needs > 0 && (
        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-800 tabular-nums dark:bg-amber-500/15 dark:text-amber-300" title={`${needs} waiting for you`}>
          {needs}
        </span>
      )}
      {note && <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-600">{note}</span>}
    </NavLink>
  );
}

function Toasts() {
  const toasts = useUi((s) => s.toasts);
  const dismiss = useUi((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-3 z-[60] flex flex-col items-center gap-2 px-3 sm:bottom-5 sm:items-end sm:px-5" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.button
            key={t.id}
            layout
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.18 }}
            onClick={() => dismiss(t.id)}
            className="card pointer-events-auto flex w-full max-w-sm items-start gap-3 p-3.5 text-left shadow-lg"
          >
            <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${t.tone === "bad" ? "bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300" : "bg-indigo-50 text-accent dark:bg-indigo-500/15 dark:text-indigo-300"}`}>
              <Icon name={t.tone === "bad" ? "alert" : "check"} size={14} strokeWidth={2.25} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{t.title}</span>
              {t.body && <span className="block truncate text-sm text-zinc-500 dark:text-zinc-400">{t.body}</span>}
            </span>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
