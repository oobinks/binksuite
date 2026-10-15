import { Link } from "react-router";
import { useSnapshot } from "../lib/hooks";
import { formatGBP } from "../lib/format";
import { ProgressBar } from "../components/ui";
import { ROOMS } from "../../shared/registry";
import { HQMap } from "./HQMap";
import { MobileGrid } from "./MobileGrid";

export function HQPage() {
  const { data: snap, error } = useSnapshot();
  if (error) return <p className="card p-6 text-center">Couldn't reach the HQ. Check your connection and refresh.</p>;
  if (!snap) return <p className="py-20 text-center text-lg font-bold">Opening the doors… 🏡</p>;

  const nextRoom = ROOMS.filter((r) => r.unlockLevel > snap.game.level).sort((a, b) => a.unlockLevel - b.unlockLevel)[0];
  const goal = snap.settings.monthlyTargetPence;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-3">
          <div className="label">This month</div>
          <div className="flex items-baseline justify-between">
            <span className="text-xl font-black">{formatGBP(snap.game.monthProfitPence)}</span>
            <span className="text-xs font-bold text-cocoa dark:text-stone-400">goal {formatGBP(goal)}</span>
          </div>
          <ProgressBar value={goal ? snap.game.monthProfitPence / goal : 0} color="#5bbf9a" className="mt-1.5" label="Monthly profit goal" />
        </div>
        <div className="card p-3">
          <div className="label">Waiting for you</div>
          <div className="text-xl font-black">
            {snap.approvalsWaiting} <span className="text-sm font-bold text-cocoa dark:text-stone-400">approval{snap.approvalsWaiting === 1 ? "" : "s"}</span>
          </div>
          <div className="text-xs font-semibold text-cocoa dark:text-stone-400">Look for the glowing ❗ on the map</div>
        </div>
        <Link to="/journal" className="card block p-3 hover:brightness-[1.02]">
          <div className="label">Next unlock</div>
          {nextRoom ? (
            <>
              <div className="text-xl font-black">
                {nextRoom.icon} {nextRoom.name}
              </div>
              <div className="text-xs font-semibold text-cocoa dark:text-stone-400">
                at Lv {nextRoom.unlockLevel} · {snap.game.nextLevelXp - snap.game.xp} XP to Lv {snap.game.level + 1}
              </div>
            </>
          ) : (
            <div className="text-xl font-black">Every room is open! 👑</div>
          )}
        </Link>
      </div>

      <div className="hidden md:block">
        <HQMap snap={snap} />
      </div>
      <div className="md:hidden">
        <MobileGrid snap={snap} />
      </div>
      <p className="text-center text-xs font-semibold text-cocoa/70 dark:text-stone-500">Tap a room to step inside. Agents work while the app is open; the night shift (every 5 min) keeps queued work moving.</p>
    </div>
  );
}
