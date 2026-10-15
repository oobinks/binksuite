import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { useSnapshot, applyTheme } from "../lib/hooks";
import { useUi } from "../lib/store";
import { formatGBP } from "../lib/format";
import { ProgressBar, Modal } from "./ui";
import { BriefingModal } from "../game/BriefingModal";
import { ApprovalsDrawer } from "../game/ApprovalsDrawer";
import { unlocksAtLevel } from "../../shared/game";

export function Layout({ children }: { children: ReactNode }) {
  const { data: snap } = useSnapshot();
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [approvalsOpen, setApprovalsOpen] = useState(false);
  const loc = useLocation();

  useEffect(() => {
    if (snap?.settings.theme) applyTheme(snap.settings.theme);
  }, [snap?.settings.theme]);

  // Show the daily briefing once per day, on the HQ.
  useEffect(() => {
    if (snap?.briefingDue && loc.pathname === "/") setBriefingOpen(true);
  }, [snap?.briefingDue, loc.pathname]);

  return (
    <div className="min-h-dvh pb-[env(safe-area-inset-bottom)]">
      <header className="sticky top-0 z-40 border-b border-black/5 bg-cream/85 backdrop-blur-md dark:border-white/10 dark:bg-night/85">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-3 py-2 sm:gap-4 sm:px-5">
          <Link to="/" className="flex items-center gap-1.5 text-lg font-black tracking-tight" aria-label="BinkSuite HQ">
            <span className="text-2xl" aria-hidden>
              🏡
            </span>
            <span className="hidden sm:inline">BinkSuite</span>
          </Link>
          {snap?.settings.demoMode && (
            <span className="chip whitespace-nowrap bg-honey/25 text-amber-800 dark:text-amber-200" title="Demo mode is on">
              🧪<span className="hidden sm:inline">Demo</span>
            </span>
          )}

          <div className="ml-auto flex items-center gap-1.5 sm:gap-3">
            {snap && (
              <>
                <Link to="/room/finance" className="flex items-center gap-1 whitespace-nowrap rounded-xl bg-amber-100 px-2.5 py-1.5 text-sm font-black text-amber-900 dark:bg-amber-900/40 dark:text-amber-100" title="Coins = your net profit">
                  <span aria-hidden>🪙</span>
                  <span data-testid="coins">{formatGBP(snap.game.coinsPence)}</span>
                </Link>
                <Link to="/journal" className="hidden min-w-[150px] flex-col gap-0.5 rounded-xl px-2 py-1 hover:bg-black/5 sm:flex dark:hover:bg-white/5" title={`${snap.game.xp} XP`}>
                  <span className="flex justify-between text-xs font-black">
                    <span>⭐ Lv {snap.game.level}</span>
                    <span className="text-cocoa/70 dark:text-stone-400">
                      {snap.game.xp}/{snap.game.nextLevelXp} XP
                    </span>
                  </span>
                  <ProgressBar value={snap.game.progress} color="#b48cf2" label="XP to next level" />
                </Link>
                <Link to="/journal" className="chip whitespace-nowrap px-2 py-1.5 text-sm sm:hidden">
                  ⭐ {snap.game.level}
                </Link>
                <button className="relative rounded-xl p-2 hover:bg-black/5 dark:hover:bg-white/5" onClick={() => setApprovalsOpen(true)} aria-label={`${snap.approvalsWaiting} approvals waiting`}>
                  <span className="text-xl" aria-hidden>
                    📥
                  </span>
                  {snap.approvalsWaiting > 0 && (
                    <span className="anim-glow absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-amber-400 px-1 text-[11px] font-black text-ink">
                      {snap.approvalsWaiting}
                    </span>
                  )}
                </button>
                <NavLink to="/journal" className="relative rounded-xl p-2 hover:bg-black/5 dark:hover:bg-white/5" aria-label="Quests and achievements">
                  <span className="text-xl" aria-hidden>
                    📜
                  </span>
                  {snap.game.questsReady > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-mint px-1 text-[11px] font-black text-white">{snap.game.questsReady}</span>
                  )}
                </NavLink>
              </>
            )}
            <button className="hidden rounded-xl p-2 hover:bg-black/5 sm:block dark:hover:bg-white/5" onClick={() => setBriefingOpen(true)} aria-label="Daily briefing">
              <span className="text-xl" aria-hidden>
                ☕
              </span>
            </button>
            <NavLink to="/settings" className="rounded-xl p-2 hover:bg-black/5 dark:hover:bg-white/5" aria-label="Settings">
              <span className="text-xl" aria-hidden>
                ⚙️
              </span>
            </NavLink>
          </div>
        </div>
        {snap && (!snap.secrets.sessionSecret || !snap.secrets.vaultMasterKey) && (
          <div className="bg-berry/15 px-4 py-1.5 text-center text-xs font-bold text-berry">
            A Cloudflare secret is missing. Open <Link className="underline" to="/setup">the setup guide</Link>.
          </div>
        )}
      </header>

      <main className="mx-auto max-w-7xl px-3 py-4 sm:px-5 sm:py-6">{children}</main>

      <Toasts />
      <LevelUp />
      <BriefingModal open={briefingOpen} onClose={() => setBriefingOpen(false)} />
      <ApprovalsDrawer open={approvalsOpen} onClose={() => setApprovalsOpen(false)} />
    </div>
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
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40 }}
            onClick={() => dismiss(t.id)}
            className="card pointer-events-auto flex w-full max-w-sm items-center gap-3 p-3 text-left"
          >
            <span className="text-2xl" aria-hidden>
              {t.icon}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-black">{t.title}</span>
              {t.body && <span className="block truncate text-sm text-cocoa dark:text-stone-400">{t.body}</span>}
            </span>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}

function LevelUp() {
  const level = useUi((s) => s.levelUp);
  const close = useUi((s) => s.closeLevelUp);
  const lv = Number(level?.title.match(/\d+/)?.[0] ?? 0);
  return (
    <Modal open={!!level} onClose={close}>
      <div className="py-4 text-center">
        <motion.div className="mx-auto mb-2 text-7xl" initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 200, damping: 10 }}>
          🌟
        </motion.div>
        <h2 className="text-3xl font-black">{level?.title}</h2>
        <p className="mt-2 text-cocoa dark:text-stone-300">{level?.body}</p>
        {lv > 0 && unlocksAtLevel(lv).length > 0 && (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {unlocksAtLevel(lv).map((u) => (
              <span key={u} className="chip bg-mint/20 px-3 py-1 text-sm text-emerald-800 dark:text-emerald-200">
                🔓 {u}
              </span>
            ))}
          </div>
        )}
        <button className="btn-primary mt-6" onClick={close}>
          Hooray!
        </button>
      </div>
    </Modal>
  );
}
