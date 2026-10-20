import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useUi } from "../../lib/store";
import { ErrorNote, Modal } from "../../components/ui";
import { plain } from "../../lib/format";
import type { TaskView } from "../../../shared/api";
import type { Settings } from "../../../shared/settings";
import { KIND_REVIEWS, REVIEWS } from "./reviews";
import { FormatBadge } from "../../components/FormatBadge";

export function ReviewModal({ task, settings, onClose }: { task: TaskView | null; settings: Settings; onClose: () => void }) {
  return (
    <Modal open={!!task} onClose={onClose} title={task ? plain(task.title) : ""} wide>
      {task && <ReviewInner key={task.id} task={task} settings={settings} onClose={onClose} />}
    </Modal>
  );
}

function ReviewInner({ task, settings, onClose }: { task: TaskView; settings: Settings; onClose: () => void }) {
  const def = KIND_REVIEWS[task.kind] ?? REVIEWS[task.room];
  const [ready, setReady] = useState(!!def?.startsReady);
  const [data, setData] = useState<Record<string, unknown> | undefined>();
  const [note, setNote] = useState("");
  const qc = useQueryClient();
  const toast = useUi((s) => s.toast);
  const decide = useMutation({
    mutationFn: (action: "approve" | "reject" | "drop") => api.post<{ state: string }>(`/tasks/${task.id}/${action}`, { note: note.trim() || undefined, ...(action === "approve" && data ? { data } : {}) }),
    onSuccess: (_r, action) => {
      if (action === "approve") {
        toast({ icon: "", title: "Approved", body: task.title });
      } else if (action === "drop") toast({ icon: "", title: "Dropped", body: task.title });
      else toast({ icon: "", title: "Sent back", body: task.title });
      qc.invalidateQueries();
      onClose();
    },
  });
  if (!def || !task.output) return <p className="text-sm text-zinc-500 dark:text-zinc-400">Nothing to review here yet.</p>;
  const label = (l: string | ((t: TaskView) => string | null)) => (typeof l === "function" ? l(task) : l);
  const dropLabel = def.dropLabel ? label(def.dropLabel) : null;
  const needsNote = def.approveNeedsNote?.(task) ?? false;
  const Body = def.Body;
  return (
    <div className="space-y-4">
      {task.demo && <p className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-100">Demo product: sample output. Your own ideas get real AI.</p>}
      {task.productId && (
        <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          <FormatBadge format={task.productFormat} /> {task.productTitle}
        </div>
      )}
      <Body task={task} settings={settings} setReady={setReady} setData={setData} />
      <div>
        <label className="label" htmlFor="review-note">
          Note {needsNote ? "(required to override)" : "(optional — tells the agent what to change)"}
        </label>
        <textarea id="review-note" className="input min-h-16" value={note} onChange={(e) => setNote(e.target.value)} placeholder={needsNote ? "Why is it OK to publish anyway?" : "e.g. warmer colours please"} />
      </div>
      <ErrorNote error={decide.error} />
      <div className="sticky -bottom-5 -mx-5 -mb-5 flex flex-wrap gap-2 border-t border-zinc-200 bg-white p-3 sm:justify-end dark:border-white/10 dark:bg-night-2">
        {dropLabel && (
          <button className="btn-soft flex-1 sm:flex-none" onClick={() => decide.mutate("drop")} disabled={decide.isPending}>
            {dropLabel}
          </button>
        )}
        <button className="btn-bad flex-1 sm:flex-none" onClick={() => decide.mutate("reject")} disabled={decide.isPending}>
          {label(def.rejectLabel)}
        </button>
        <button
          className="btn-good order-first w-full sm:order-last sm:w-auto"
          onClick={() => decide.mutate("approve")}
          disabled={decide.isPending || !ready || (needsNote && note.trim().length < 5)}
          title={!ready ? "Finish reviewing first" : undefined}
        >
          {label(def.approveLabel)}
        </button>
      </div>
    </div>
  );
}
