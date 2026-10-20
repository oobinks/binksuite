// Goals, achievements and milestones.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useUi } from "../lib/store";
import { formatGBP, plain } from "../lib/format";
import { ProgressBar, Section } from "../components/ui";
import { Icon } from "../components/Icon";
import { PageHeader } from "../components/PageHeader";
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
    onSuccess: () => {
      toast({ icon: "", title: "Goal completed", body: "Marked as done" });
      qc.invalidateQueries();
    },
  });

  const list = (quests.data?.quests ?? []).filter((q) => q.visible);
  const groups: [string, QuestStatus[]][] = [
    ["Getting started", list.filter((q) => q.quest.kind === "campaign")],
    ["Daily", list.filter((q) => q.quest.kind === "daily")],
    ["Weekly", list.filter((q) => q.quest.kind === "weekly")],
  ];
  const achievements = ach.data?.achievements ?? [];
  const unlocked = achievements.filter((a) => a.unlockedAt).length;
  const level = snap?.game.level ?? 1;

  return (
    <div className="space-y-8">
      <PageHeader title="Activity" subtitle="Goals, achievements and milestones for the shop." />

      <section>
        <h2 className="mb-3 text-[15px] font-semibold">Goals</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          {groups.map(([title, qs]) => (
            <Section key={title} title={title} right={<span className="text-xs text-zinc-400 tabular-nums">{qs.length}</span>}>
              <ul className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
                {qs.map((q) => (
                  <li key={q.quest.id} className={`py-3 first:pt-0 last:pb-0 ${q.claimed ? "opacity-60" : ""}`}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium">{plain(q.quest.title)}</span>
                      {q.claimed ? (
                        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                          <Icon name="check" size={13} /> Done
                        </span>
                      ) : (
                        <span className="shrink-0 text-[11px] text-zinc-400 tabular-nums dark:text-zinc-500">{q.quest.xp} XP</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{plain(q.quest.description)}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <ProgressBar value={q.progress / q.quest.target} color={q.complete ? "#10b981" : "#4f46e5"} className="flex-1" label={q.quest.title} />
                      <span className="text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
                        {q.quest.metric === "profit" ? `${formatGBP(q.progress)}/${formatGBP(q.quest.target)}` : `${q.progress}/${q.quest.target}`}
                      </span>
                    </div>
                    {q.complete && !q.claimed && (
                      <button className="btn-primary mt-2.5 w-full px-2.5 py-1 text-xs" onClick={() => claim.mutate(q.quest.id)} disabled={claim.isPending}>
                        Mark complete
                      </button>
                    )}
                  </li>
                ))}
                {qs.length === 0 && <li className="py-2 text-sm text-zinc-500 dark:text-zinc-400">Nothing outstanding.</li>}
              </ul>
            </Section>
          ))}
        </div>
      </section>

      <Section title="Achievements" right={<span className="text-xs text-zinc-500 tabular-nums dark:text-zinc-400">{unlocked} of {achievements.length} unlocked</span>}>
        <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {achievements.map((a) => {
            const done = !!a.unlockedAt;
            return (
              <li key={a.id} className={`flex items-start gap-3 rounded-lg border p-3 ${done ? "border-zinc-200 bg-white dark:border-white/10 dark:bg-night-2" : "border-zinc-200/70 bg-zinc-50 dark:border-white/[0.06] dark:bg-white/[0.02]"}`}>
                <span
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${done ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-zinc-100 text-zinc-400 dark:bg-white/[0.06] dark:text-zinc-500"}`}
                  aria-label={done ? "Unlocked" : "Locked"}
                >
                  <Icon name={done ? "check" : "lock"} size={14} />
                </span>
                <div className="min-w-0">
                  <div className={`text-sm font-medium ${done ? "" : "text-zinc-500 dark:text-zinc-400"}`}>{plain(a.title)}</div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">{plain(a.description)}</div>
                </div>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Milestones" right={<span className="text-xs text-zinc-500 dark:text-zinc-400">All areas are always available</span>}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] font-semibold tracking-[0.06em] text-zinc-500 uppercase">
              <th className="w-12 pb-2 font-semibold">Level</th>
              <th className="pb-2 font-semibold">Title</th>
              <th className="pb-2 text-right font-semibold">XP</th>
              <th className="w-8 pb-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
            {Array.from({ length: MAX_LADDER_LEVEL }, (_, i) => i + 1).map((lv) => {
              const reached = level >= lv;
              return (
                <tr key={lv} className={reached ? "" : "text-zinc-500 dark:text-zinc-400"}>
                  <td className="py-2 tabular-nums">{lv}</td>
                  <td className={`py-2 ${lv === level ? "font-medium text-zinc-900 dark:text-white" : ""}`}>
                    {plain(levelTitle(lv))}
                    {lv === level && <span className="chip ml-2">Current</span>}
                  </td>
                  <td className="py-2 text-right tabular-nums">{xpForLevel(lv).toLocaleString("en-GB")}</td>
                  <td className="py-2 text-right">{reached && <Icon name="check" size={14} className="ml-auto text-emerald-600 dark:text-emerald-400" />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>
    </div>
  );
}
