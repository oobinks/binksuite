import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { celebrate, useUi } from "../../lib/store";
import { ErrorNote, Modal } from "../../components/ui";
import { ROOM_BY_ID } from "../../../shared/registry";
import type { TaskView } from "../../../shared/api";
import type { Settings } from "../../../shared/settings";
import { REVIEWS } from "./reviews";

export function ReviewModal({ task, settings, onClose }: { task: TaskView | null; settings: Settings; onClose: () => void }) {
  return (
    <Modal open={!!task} onClose={onClose} title={task ? `${ROOM_BY_ID[task.room].icon} ${task.title}` : ""} wide>
      {task && <ReviewInner key={task.id} task={task} settings={settings} onClose={onClose} />}
    </Modal>
  );
}

function ReviewInner({ task, settings, onClose }: { task: TaskView; settings: Settings; onClose: () => void }) {
  const def = REVIEWS[task.room];
  const [ready, setReady] = useState(!!def?.startsReady);
  const [note, setNote] = useState("");
  const qc = useQueryClient();
  const toast = useUi((s) => s.toast);
  const decide = useMutation({
    mutationFn: (action: "approve" | "reject") => api.post<{ state: string }>(`/tasks/${task.id}/${action}`, { note: note.trim() || undefined }),
    onSuccess: (_r, action) => {
      if (action === "approve") {
        celebrate("small");
        toast({ icon: "👍", title: "Approved! +15 XP", body: task.title });
      } else toast({ icon: "↩️", title: "Sent back", body: task.title });
      qc.invalidateQueries();
      onClose();
    },
  });
  if (!def || !task.output) return <p>Nothing to review here yet.</p>;
  const label = (l: string | ((t: TaskView) => string)) => (typeof l === "function" ? l(task) : l);
  const needsNote = def.approveNeedsNote?.(task) ?? false;
  const Body = def.Body;
  return (
    <div className="space-y-4">
      {task.demo && <p className="chip bg-honey/25 text-amber-800 dark:text-amber-200">🧪 Demo output — real AI arrives in Phase {ROOM_BY_ID[task.room].phase}</p>}
      <Body task={task} settings={settings} setReady={setReady} />
      <div>
        <label className="label" htmlFor="review-note">
          Note {needsNote ? "(required to override)" : "(optional — tells the agent what to change)"}
        </label>
        <textarea id="review-note" className="input min-h-16" value={note} onChange={(e) => setNote(e.target.value)} placeholder={needsNote ? "Why is it OK to publish anyway?" : "e.g. warmer colours please"} />
      </div>
      <ErrorNote error={decide.error} />
      <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-col-reverse gap-2 border-t border-black/5 bg-white/95 p-3 sm:flex-row sm:justify-end dark:border-white/10 dark:bg-night-2/95">
        <button className="btn-bad" onClick={() => decide.mutate("reject")} disabled={decide.isPending}>
          {label(def.rejectLabel)}
        </button>
        <button
          className="btn-good"
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
