// Claude bar: shows what's on Claude's to-do list and starts a Claude Code session
// (on your Claude subscription) while you're on the site.
import { useEffect, useRef } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useUi } from "../lib/store";
import { describeJob } from "../../shared/claudeJobs";
import { Icon } from "./Icon";

const BAR = "flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-t border-indigo-100 bg-indigo-50/80 px-4 py-2 text-xs text-indigo-950 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-100";

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
      <div className={BAR}>
        <Icon name="sparkles" size={14} className="text-accent dark:text-indigo-300" />
        <span>Claude Code is chosen but not connected yet.</span> <Link className="font-semibold underline underline-offset-2" to="/settings">Finish setting it up</Link>
      </div>
    );
  if (!data.waiting && !data.working && !data.running) return null;
  // The job in Claude's hands, or the next one up.
  const now = data.jobs.find((j) => j.status === "working") ?? data.jobs[0];
  return (
    <div className={BAR}>
      <Icon name="sparkles" size={14} className={`text-accent dark:text-indigo-300 ${data.running || data.working ? "anim-glow" : ""}`} />
      {data.running || data.working ? (
        <>
          <span className="font-semibold">Claude is working on {data.waiting + data.working} job{data.waiting + data.working === 1 ? "" : "s"}…</span>
          {now && (
            <span className="w-full text-center text-zinc-600 sm:w-auto dark:text-zinc-300">
              Now: {describeJob(now)}
              {data.jobs.length > 1 ? ` · then ${data.jobs.length - 1} more` : ""}
            </span>
          )}
          {data.run?.sessionUrl && (
            <a className="font-semibold underline underline-offset-2" href={data.run.sessionUrl} target="_blank" rel="noreferrer">
              watch
            </a>
          )}
        </>
      ) : (
        <>
          <span>
            {data.waiting} job{data.waiting === 1 ? "" : "s"} waiting for Claude{now ? `: ${describeJob(now)}${data.jobs.length > 1 ? ` and ${data.jobs.length - 1} more` : ""}` : ""}
            {data.run?.error ? ` · ${data.run.error}` : ""}
          </span>
          <button className="rounded-md bg-accent px-2.5 py-1 font-semibold text-white hover:bg-accent-strong dark:bg-indigo-500" onClick={() => start.mutate(false)} disabled={start.isPending}>
            {start.isPending ? "Starting…" : "Start Claude"}
          </button>
        </>
      )}
    </div>
  );
}
