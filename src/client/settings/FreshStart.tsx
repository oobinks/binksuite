// Start fresh: download a backup, then remove every product to launch real ones from a clean shop.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useUi } from "../lib/store";
import { ErrorNote, Section } from "../components/ui";
import { Icon } from "../components/Icon";

const GOES = ["Every product (real and demo), its files and listing photos", "Their tasks, approvals and Claude jobs", "Room activity logs, pins, the content calendar and listing performance history", "All demo data, and demo mode is switched off"];
const STAYS = ["Today's ideas (ready to send to the task board again)", "Your money records, Etsy orders and reviews", "Settings, keys, Etsy and Claude connections", "Weekly reports, achievements and the trend radar"];

export function FreshStart() {
  const qc = useQueryClient();
  const toast = useUi((s) => s.toast);
  const [backedUp, setBackedUp] = useState(false);
  const [typed, setTyped] = useState("");

  const backup = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/export", { credentials: "same-origin" });
      if (!res.ok) throw new Error("Couldn't make the backup. Try again.");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `binksuite-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    },
    onSuccess: () => setBackedUp(true),
  });
  const wipe = useMutation({
    mutationFn: () => api.post<{ products: number; tasks: number; files: number }>("/fresh-start", { confirm: "DELETE" }),
    onSuccess: (r) => {
      toast({ icon: "", title: "Fresh start done", body: `Removed ${r.products} product${r.products === 1 ? "" : "s"} and ${r.files} file${r.files === 1 ? "" : "s"}. Today's ideas are kept.` });
      setTyped("");
      setBackedUp(false);
      qc.invalidateQueries();
    },
  });

  return (
    <Section title="Start fresh" id="fresh-start">
      <div className="space-y-4 text-sm">
        <p className="text-zinc-600 dark:text-zinc-400">Clear out every product so you can launch real ones from a clean shop. Nothing changes on Etsy itself.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-3 dark:border-rose-500/30 dark:bg-rose-500/10">
            <div className="mb-1.5 text-xs font-semibold text-rose-800 dark:text-rose-200">Deleted</div>
            <ul className="space-y-1 text-rose-900 dark:text-rose-100">
              {GOES.map((g) => (
                <li key={g} className="flex gap-2">
                  <Icon name="close" size={14} className="mt-0.5" />
                  {g}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/10">
            <div className="mb-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-200">Kept</div>
            <ul className="space-y-1 text-emerald-900 dark:text-emerald-100">
              {STAYS.map((g) => (
                <li key={g} className="flex gap-2">
                  <Icon name="check" size={14} className="mt-0.5" />
                  {g}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <ol className="space-y-3">
          <li className="flex flex-wrap items-center gap-3">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-zinc-900 text-xs font-semibold text-white dark:bg-white dark:text-zinc-900">1</span>
            <button className="btn-soft" onClick={() => backup.mutate()} disabled={backup.isPending}>
              {backup.isPending ? "Making the backup…" : "Download a backup first"}
            </button>
            {backedUp && (
              <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                <Icon name="check" size={14} /> Backup downloaded
              </span>
            )}
          </li>
          <li className="flex flex-wrap items-center gap-3">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-zinc-900 text-xs font-semibold text-white dark:bg-white dark:text-zinc-900">2</span>
            <input className="input !w-40" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type DELETE" aria-label="Type DELETE to confirm" disabled={!backedUp} />
            <button className="btn-bad" onClick={() => wipe.mutate()} disabled={!backedUp || typed.trim() !== "DELETE" || wipe.isPending}>
              {wipe.isPending ? "Clearing…" : "Delete all products"}
            </button>
          </li>
        </ol>
        <ErrorNote error={backup.error ?? wipe.error} />
        <p className="text-xs text-zinc-500 dark:text-zinc-400">This can't be undone. Drafts or listings already sent to Etsy stay on Etsy: delete them there if you don't want them.</p>
      </div>
    </Section>
  );
}
