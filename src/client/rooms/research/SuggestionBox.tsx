// 💡 Suggest your own idea; Scout goes off and does the market research.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useUi } from "../../lib/store";
import { timeAgo } from "../../lib/format";
import { ErrorNote, Section } from "../../components/ui";
import type { TaskView } from "../../../shared/api";

interface Suggestion {
  productId: string;
  idea: string;
  notes: string | null;
  stage: string;
  verdict: "go" | "maybe" | "skip" | null;
  overall: number | null;
  createdAt: string;
}

const VERDICT_CHIP = {
  go: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  maybe: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  skip: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200",
};

export function SuggestionBox({ tasks, onOpen, aiReady }: { tasks: TaskView[]; onOpen: (t: TaskView) => void; aiReady: boolean }) {
  const qc = useQueryClient();
  const toast = useUi((s) => s.toast);
  const [idea, setIdea] = useState("");
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const { data } = useQuery({
    queryKey: ["suggestions"],
    queryFn: () => api.get<{ suggestions: Suggestion[] }>("/research/suggestions"),
    refetchInterval: 4000,
  });
  const [theme, setTheme] = useState("");
  const brainstorm = useMutation({
    mutationFn: () => api.post<{ real: boolean; ideas: { idea: string; why: string }[] }>("/research/ideas", { theme: theme || undefined }),
  });
  const send = useMutation({
    mutationFn: () => api.post("/research/suggestions", { idea, notes: notes || undefined }),
    onSuccess: () => {
      toast({ icon: "💡", title: "Idea sent to Scout", body: idea });
      setIdea("");
      setNotes("");
      setShowNotes(false);
      qc.invalidateQueries();
    },
  });

  const status = (s: Suggestion) => {
    const task = tasks.find((t) => t.productId === s.productId && t.kind === "niche_score" && t.state === "needs_approval");
    if (task) return { label: "Report ready ❗", task };
    if (s.stage === "dropped") return { label: "Dropped" };
    if (s.stage === "research" && !s.verdict) return { label: "Researching… 🔎" };
    if (s.stage === "live") return { label: "Live 🚀" };
    return { label: `Making it · ${s.stage}` };
  };

  return (
    <Section title="Suggestion box" icon="💡">
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          send.mutate();
        }}
      >
        <label className="block">
          <span className="label">Your idea</span>
          <div className="flex gap-2">
            <input
              className="input text-base"
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder="e.g. Cottagecore mushroom wall art"
              maxLength={120}
              aria-label="Your idea"
            />
            <button className="btn-primary shrink-0" disabled={send.isPending || idea.trim().length < 3}>
              {send.isPending ? "Sending…" : "Research it 🔎"}
            </button>
          </div>
        </label>
        {showNotes ? (
          <textarea
            className="input min-h-16"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything you know: who it's for, shops you've seen, prices you've spotted…"
            aria-label="Notes for Scout"
          />
        ) : (
          <button type="button" className="text-xs font-bold text-cocoa underline dark:text-stone-400" onClick={() => setShowNotes(true)}>
            + Add notes for Scout
          </button>
        )}
        <ErrorNote error={send.error} />
      </form>
      <div className="mt-3 rounded-xl bg-black/[0.03] p-2.5 dark:bg-white/[0.04]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold">Stuck for ideas?</span>
          <input
            className="input !w-auto min-w-0 flex-1 !py-1"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            placeholder="Optional theme, e.g. nursery, Christmas"
            aria-label="Idea theme"
          />
          <button type="button" className="btn-soft !py-1" onClick={() => brainstorm.mutate()} disabled={brainstorm.isPending}>
            {brainstorm.isPending ? "Thinking…" : "✨ Suggest ideas for me"}
          </button>
        </div>
        <ErrorNote error={brainstorm.error} />
        {brainstorm.data && (
          <ul className="mt-2 space-y-1">
            {brainstorm.data.ideas.map((i) => (
              <li key={i.idea}>
                <button type="button" className="w-full rounded-lg p-1.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5" onClick={() => setIdea(i.idea)}>
                  <b>💡 {i.idea}</b> <span className="text-cocoa dark:text-stone-400">· {i.why}</span>
                </button>
              </li>
            ))}
            <li className="text-xs text-cocoa dark:text-stone-400">Tap one to put it in the box, then press Research it.{brainstorm.data.real ? "" : " (demo ideas)"}</li>
          </ul>
        )}
      </div>
      <p className="mt-2 text-xs text-cocoa dark:text-stone-400">
        Scout checks demand, competition, how well AI can make it, price range, seasonality and trademark risks, then gives a ✅ go, 🤔 maybe or ⛔ skip. Your ideas jump the
        queue.{" "}
        {aiReady
          ? "🤖 Scout uses free Cloudflare AI. It can't browse the web, so treat scores as an informed estimate."
          : "Research is simulated until real AI is switched on in Settings."}
      </p>
      {!!data?.suggestions.length && (
        <ul className="mt-3 space-y-1.5">
          {data.suggestions.map((s) => {
            const st = status(s);
            return (
              <li key={s.productId} className="flex items-center gap-2 rounded-xl p-2 ring-1 ring-black/5 dark:ring-white/10">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{s.idea}</span>
                  <span className="text-xs text-cocoa dark:text-stone-400">
                    {st.label} · {timeAgo(s.createdAt)}
                  </span>
                </span>
                {s.verdict && (
                  <span className={`chip ${VERDICT_CHIP[s.verdict]}`}>
                    {s.verdict.toUpperCase()} {s.overall}
                  </span>
                )}
                {st.task && (
                  <button className="btn-good !py-1 text-xs" onClick={() => onOpen(st.task!)}>
                    Read report
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
