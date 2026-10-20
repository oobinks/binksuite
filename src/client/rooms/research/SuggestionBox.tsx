// Suggest your own idea; Scout goes off and does the market research.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useUi } from "../../lib/store";
import { plain, timeAgo } from "../../lib/format";
import { Icon } from "../../components/Icon";
import { ErrorNote, Section } from "../../components/ui";
import type { TaskView } from "../../../shared/api";
import { ALL_FORMATS_ON, enabledFormats, FORMAT_INFO, guessFormat, pickFormat, type ProductFormat } from "../../../shared/format";
import { useSnapshot } from "../../lib/hooks";
import { FormatBadge } from "../../components/FormatBadge";

interface Suggestion {
  productId: string;
  format: ProductFormat;
  idea: string;
  notes: string | null;
  stage: string;
  verdict: "go" | "maybe" | "skip" | null;
  overall: number | null;
  createdAt: string;
}

const VERDICT_CHIP = {
  go: { label: "Go", dot: "bg-emerald-500" },
  maybe: { label: "Maybe", dot: "bg-amber-500" },
  skip: { label: "Skip", dot: "bg-rose-500" },
};

export function SuggestionBox({ tasks, onOpen, aiReady }: { tasks: TaskView[]; onOpen: (t: TaskView) => void; aiReady: boolean }) {
  const qc = useQueryClient();
  const toast = useUi((s) => s.toast);
  const [idea, setIdea] = useState("");
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  // null = let the app guess from the wording.
  const [format, setFormat] = useState<ProductFormat | null>(null);
  // Only the kinds of product switched on in Settings → Products we make.
  const switches = useSnapshot().data?.settings.formats ?? ALL_FORMATS_ON;
  const guessed = pickFormat(guessFormat(idea), switches);
  const { data } = useQuery({
    queryKey: ["suggestions"],
    queryFn: () => api.get<{ suggestions: Suggestion[] }>("/research/suggestions"),
    refetchInterval: 4000,
  });
  const [theme, setTheme] = useState("");
  const brainstorm = useMutation({
    mutationFn: () => api.post<{ real: boolean; pending?: boolean; ideas: { idea: string; why: string }[] }>("/research/ideas", { theme: theme || undefined }),
  });
  const send = useMutation({
    mutationFn: () => api.post("/research/suggestions", { idea, notes: notes || undefined, format: format ?? guessed }),
    onSuccess: () => {
      toast({ icon: "", title: "Idea sent to Scout", body: idea });
      setIdea("");
      setNotes("");
      setFormat(null);
      setShowNotes(false);
      qc.invalidateQueries();
    },
  });

  const status = (s: Suggestion) => {
    const task = tasks.find((t) => t.productId === s.productId && t.kind === "niche_score" && t.state === "needs_approval");
    if (task) return { label: "Report ready", dot: "bg-amber-500", task };
    if (s.stage === "dropped") return { label: "Dropped", dot: "bg-zinc-400" };
    if (s.stage === "research" && !s.verdict) return { label: "Researching…", dot: "bg-indigo-500 anim-glow" };
    if (s.stage === "live") return { label: "Live", dot: "bg-emerald-500" };
    return { label: `Making it · ${s.stage}`, dot: "bg-indigo-500" };
  };

  return (
    <Section title="Suggestion box">
      <form
        className="space-y-3"
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
              {send.isPending ? "Sending…" : "Research it"}
            </button>
          </div>
        </label>
        <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="What should we make?">
          <span className="mr-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">Make it as</span>
          {enabledFormats(switches).map((f) => {
            const on = (format ?? guessed) === f;
            return (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setFormat(f)}
                className={`rounded-md border px-2 py-1 text-[11px] font-semibold tracking-wide transition ${on ? "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-300" : "border-zinc-200 bg-white text-zinc-500 hover:text-zinc-800 dark:border-white/10 dark:bg-transparent dark:text-zinc-400 dark:hover:text-zinc-200"}`}
                title={FORMAT_INFO[f].long}
              >
                {FORMAT_INFO[f].label}
              </button>
            );
          })}
          <span className="ml-1 text-[11px] text-zinc-500 dark:text-zinc-400">{format ? FORMAT_INFO[format].long : idea.trim() ? `Guessed from your idea · ${FORMAT_INFO[guessed].long}` : "Picked from your idea"}</span>
        </div>
        {showNotes ? (
          <textarea
            className="input min-h-16"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything you know: who it's for, shops you've seen, prices you've spotted…"
            aria-label="Notes for Scout"
          />
        ) : (
          <button type="button" className="text-xs font-medium text-zinc-500 underline-offset-2 hover:text-zinc-800 hover:underline dark:text-zinc-400 dark:hover:text-zinc-200" onClick={() => setShowNotes(true)}>
            Add notes for Scout
          </button>
        )}
        <ErrorNote error={send.error} />
      </form>
      <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-white/10 dark:bg-white/[0.03]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">Stuck for ideas?</span>
          <input
            className="input !w-auto min-w-0 flex-1 !py-1"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            placeholder="Optional theme, e.g. nursery, Christmas"
            aria-label="Idea theme"
          />
          <button type="button" className="btn-soft inline-flex items-center gap-1.5 !py-1" onClick={() => brainstorm.mutate()} disabled={brainstorm.isPending}>
            <Icon name="sparkles" size={14} />
            {brainstorm.isPending ? "Thinking…" : "Suggest ideas for me"}
          </button>
        </div>
        <ErrorNote error={brainstorm.error} />
        {brainstorm.data?.pending && (
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">Added to Claude's to-do list. Tap the button again once Claude's session has finished to see the ideas.</p>
        )}
        {brainstorm.data && !brainstorm.data.pending && (
          <ul className="mt-2 space-y-0.5">
            {brainstorm.data.ideas.map((i) => (
              <li key={i.idea}>
                <button
                  type="button"
                  className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-white dark:hover:bg-white/5"
                  onClick={() => (setIdea(i.idea), setFormat(null))}
                >
                  <FormatBadge format={pickFormat(guessFormat(i.idea), switches)} /> <span className="font-medium">{plain(i.idea)}</span> <span className="text-zinc-500 dark:text-zinc-400">· {plain(i.why)}</span>
                </button>
              </li>
            ))}
            <li className="px-2 pt-1 text-xs text-zinc-500 dark:text-zinc-400">Tap one to put it in the box, then press Research it.{brainstorm.data.real ? "" : " (demo ideas)"}</li>
          </ul>
        )}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
        ART = wall art prints · EXCEL = a ready-made spreadsheet with formulas (plus a printable PDF) · PDF = a printable planner or tracker. Scout checks demand,
        competition, how well we can make it, price range, seasonality and trademark risks, then gives a go, maybe or skip. Your ideas jump the
        queue.{" "}
        {aiReady
          ? "Scout uses free Cloudflare AI. It can't browse the web, so treat scores as an informed estimate."
          : "Research is simulated until real AI is switched on in Settings."}
      </p>
      {!!data?.suggestions.length && (
        <ul className="mt-4 divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-white/[0.06] dark:border-white/10">
          {data.suggestions.map((s) => {
            const st = status(s);
            return (
              <li key={s.productId} className="flex items-center gap-2.5 px-3 py-2.5">
                <FormatBadge format={s.format} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{s.idea}</span>
                  <span className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${st.dot}`} aria-hidden />
                    {st.label} · {timeAgo(s.createdAt)}
                  </span>
                </span>
                {s.verdict && (
                  <span className="chip gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${VERDICT_CHIP[s.verdict].dot}`} aria-hidden />
                    {VERDICT_CHIP[s.verdict].label} <span className="tabular-nums">{s.overall}</span>
                  </span>
                )}
                {st.task && (
                  <button className="btn-primary !px-2.5 !py-1 text-xs" onClick={() => onOpen(st.task!)}>
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
