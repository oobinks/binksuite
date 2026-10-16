// Quests, achievements and the level ladder.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { api } from "../lib/api";
import { celebrate, useUi } from "../lib/store";
import { formatGBP } from "../lib/format";
import { ProgressBar, Section } from "../components/ui";
import { useSnapshot } from "../lib/hooks";
import { MAX_LADDER_LEVEL, levelTitle, xpForLevel, type QuestStatus } from "../../shared/game";
import type { AchievementView } from "../../shared/api";

export function JournalPage() {
  const qc = useQueryClient();
  const { data: snap } = useSnapshot();
  const quests = useQuery({ queryKey: ["quests"], queryFn: () => api.get<{ quests: QuestStatus[] }>("/quests"), refetchInterval: 5000 });
  const ach = useQuery({ queryKey: ["achievements"], queryFn: () => api.get<{ achievements: AchievementView[] }>("/achievements") });
  const toast = useUi((s) => s.toast);
  const claim = useMutation({
    mutationFn: (id: string) => api.post<{ xp: number }>(`/quests/${id}/claim`),
    onSuccess: (r) => {
      celebrate("small");
      toast({ icon: "📜", title: `+${r.xp} XP`, body: "Quest reward claimed" });
      qc.invalidateQueries();
    },
  });

  const list = (quests.data?.quests ?? []).filter((q) => q.visible);
  const groups: [string, string, QuestStatus[]][] = [
    ["Starter campaign", "🗺️", list.filter((q) => q.quest.kind === "campaign")],
    ["Daily", "☀️", list.filter((q) => q.quest.kind === "daily")],
    ["Weekly", "📅", list.filter((q) => q.quest.kind === "weekly")],
  ];

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-black">📜 Journal</h1>
      <div className="grid gap-4 lg:grid-cols-3">
        {groups.map(([title, icon, qs]) => (
          <Section key={title} title={title} icon={icon}>
            <ul className="space-y-3">
              {qs.map((q) => (
                <li key={q.quest.id} className={`rounded-xl p-3 ring-1 ring-black/5 dark:ring-white/10 ${q.claimed ? "opacity-60" : ""}`}>
                  <div className="flex items-start gap-2">
                    <span className="text-2xl" aria-hidden>
                      {q.quest.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-black">{q.quest.title}</span>
                        <span className="chip">+{q.quest.xp} XP</span>
                      </div>
                      <p className="text-sm text-cocoa dark:text-stone-400">{q.quest.description}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <ProgressBar value={q.progress / q.quest.target} color="#5bbf9a" className="flex-1" label={q.quest.title} />
                        <span className="text-xs font-bold">
                          {q.quest.metric === "profit" ? `${formatGBP(q.progress)}/${formatGBP(q.quest.target)}` : `${q.progress}/${q.quest.target}`}
                        </span>
                      </div>
                    </div>
                  </div>
                  {q.complete && !q.claimed && (
                    <motion.button
                      initial={{ scale: 0.9 }}
                      animate={{ scale: [1, 1.04, 1] }}
                      transition={{ repeat: Infinity, duration: 1.4 }}
                      className="btn-good mt-2 w-full"
                      onClick={() => claim.mutate(q.quest.id)}
                      disabled={claim.isPending}
                    >
                      🎁 Claim reward
                    </motion.button>
                  )}
                  {q.claimed && <p className="mt-1 text-xs font-bold text-emerald-700 dark:text-emerald-300">✅ Claimed</p>}
                </li>
              ))}
              {qs.length === 0 && <li className="text-sm text-cocoa">All done! 🎉</li>}
            </ul>
          </Section>
        ))}
      </div>

      <Section title="Achievements" icon="🏅">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {(ach.data?.achievements ?? []).map((a) => (
            <li key={a.id} className={`rounded-2xl p-3 text-center ring-1 ring-black/5 dark:ring-white/10 ${a.unlockedAt ? "bg-amber-50 dark:bg-amber-900/20" : "opacity-50 grayscale"}`}>
              <div className="text-4xl" aria-hidden>
                {a.unlockedAt ? a.icon : "🔒"}
              </div>
              <div className="mt-1 font-black">{a.title}</div>
              <div className="text-xs text-cocoa dark:text-stone-400">{a.description}</div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Shop titles" icon="🔝" right={<span className="chip">every room is always open</span>}>
        <ol className="space-y-2">
          {Array.from({ length: MAX_LADDER_LEVEL }, (_, i) => i + 1).map((lv) => {
            const reached = (snap?.game.level ?? 1) >= lv;
            return (
              <li key={lv} className={`flex items-center gap-3 rounded-xl p-2 ${reached ? "bg-mint/10" : ""}`}>
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full font-black ${reached ? "bg-mint text-white" : "bg-black/10 dark:bg-white/10"}`}>{lv}</span>
                <span className="flex-1 text-sm font-semibold">{levelTitle(lv)}</span>
                <span className="text-xs text-cocoa dark:text-stone-400">{xpForLevel(lv)} XP</span>
              </li>
            );
          })}
        </ol>
      </Section>
    </div>
  );
}
