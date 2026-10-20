// ✨ Claude bar: shows what's on Claude's to-do list and starts a Claude Code session
// (on your Claude subscription) while you're on the site.
import { useEffect, useRef } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useUi } from "../lib/store";
import { describeJob } from "../../shared/claudeJobs";

export interface ClaudeStatus {
  provider: "workers" | "claude-code";
  autoStart: boolean;
  connected: boolean;
  routine: { last4: string; updatedAt: string } | null;
  keySet: boolean;
  waiting: number;
  working: number;
  jobs: { id: string; title: string; kind: string; status: string; error: string | null; createdAt: string }[];
  run: { at: string; sessionUrl?: string | null; finishedAt?: string; answered?: number; error?: string | null } | null;
  running: boolean;
}

export function useClaude(enabled = true) {
  return useQuery({ queryKey: ["claude"], queryFn: () => api.get<ClaudeStatus>("/claude"), refetchInterval: 15_000, enabled });
}

export function ClaudeBar({ provider }: { provider: string | undefined }) {
  const on = provider === "claude-code";
  const { data } = useClaude(on);
  const qc = useQueryClient();
  const toast = useUi((s) => s.toast);
  const start = useMutation({
    mutationFn: (auto: boolean) => api.post<{ started: boolean; reason?: string; running?: boolean; sessionUrl?: string | null; jobs?: number }>("/claude/start", { auto }),
    onSuccess: (r, auto) => {
      if (r.started) toast({ icon: "✨", title: `Claude is on it: ${r.jobs} job${r.jobs === 1 ? "" : "s"}`, body: "Runs on your Claude plan. Results appear here as they're done." });
      else if (!auto && r.reason) toast({ icon: "✨", title: r.reason });
      qc.invalidateQueries({ queryKey: ["claude"] });
    },
    onError: (e, auto) => {
      if (!auto) toast({ icon: "⚠️", title: "Couldn't start Claude", body: e instanceof Error ? e.message : undefined });
      qc.invalidateQueries({ queryKey: ["claude"] });
    },
  });

  // Auto-start: only while you're here, the tab is visible, and Claude has work.
  const tried = useRef(0);
  useEffect(() => {
    if (!data || !data.connected || !data.autoStart || data.running || data.waiting === 0 || start.isPending) return;
    if (document.visibilityState !== "visible" || Date.now() - tried.current < 60_000) return;
    tried.current = Date.now();
    start.mutate(true);
  }, [data, start]);

  if (!on || !data) return null;
  if (!data.connected)
    return (
      <div className="bg-violet-100 px-4 py-1.5 text-center text-xs font-bold text-violet-900 dark:bg-violet-900/40 dark:text-violet-100">
        ✨ Claude Code is chosen but not connected yet. <Link className="underline" to="/settings">Finish setting it up</Link>.
      </div>
    );
  if (!data.waiting && !data.working && !data.running) return null;
  // The job in Claude's hands, or the next one up.
  const now = data.jobs.find((j) => j.status === "working") ?? data.jobs[0];
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 bg-violet-100 px-4 py-1.5 text-xs font-bold text-violet-900 dark:bg-violet-900/40 dark:text-violet-100">
      {data.running || data.working ? (
        <>
          <span className="animate-pulse">✨ Claude is working on {data.waiting + data.working} job{data.waiting + data.working === 1 ? "" : "s"}…</span>
          {now && (
            <span className="w-full text-center font-semibold sm:w-auto">
              Now: {describeJob(now)}
              {data.jobs.length > 1 ? ` · then ${data.jobs.length - 1} more` : ""}
            </span>
          )}
          {data.run?.sessionUrl && (
            <a className="underline" href={data.run.sessionUrl} target="_blank" rel="noreferrer">
              watch
            </a>
          )}
        </>
      ) : (
        <>
          <span>
            ✨ {data.waiting} job{data.waiting === 1 ? "" : "s"} waiting for Claude{now ? `: ${describeJob(now)}${data.jobs.length > 1 ? ` and ${data.jobs.length - 1} more` : ""}` : ""}
            {data.run?.error ? ` · ${data.run.error}` : ""}
          </span>
          <button className="rounded-full bg-violet-700 px-3 py-0.5 text-white" onClick={() => start.mutate(false)} disabled={start.isPending}>
            {start.isPending ? "Starting…" : "Start Claude"}
          </button>
        </>
      )}
    </div>
  );
}
