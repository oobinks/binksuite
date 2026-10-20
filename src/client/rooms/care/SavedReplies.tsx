// Saved replies: reusable answers you copy into Etsy Messages.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useUi } from "../../lib/store";
import { ErrorNote, Section } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { CopyButton } from "../shared/CopyButton";

interface Template {
  id: string;
  title: string;
  body: string;
}

function Editor({ initial, onSave, onCancel, saving }: { initial: { title: string; body: string }; onSave: (t: { title: string; body: string }) => void; onCancel: () => void; saving: boolean }) {
  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body);
  return (
    <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-white/10 dark:bg-white/[0.03]">
      <input className="input w-full" placeholder="Name, e.g. Thank you for your order" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} aria-label="Name" />
      <textarea className="input min-h-32 w-full" placeholder="The reply" value={body} maxLength={3000} onChange={(e) => setBody(e.target.value)} aria-label="Reply" />
      <div className="flex gap-2">
        <button className="btn-primary px-3 py-1.5 text-sm" disabled={saving || !title.trim() || !body.trim()} onClick={() => onSave({ title, body })}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button className="btn-soft px-3 py-1.5 text-sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export function SavedReplies() {
  const qc = useQueryClient();
  const toast = useUi((s) => s.toast);
  const { data } = useQuery({ queryKey: ["care", "templates"], queryFn: () => api.get<{ templates: Template[] }>("/care/templates") });
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const done = () => (setEditing(null), qc.invalidateQueries({ queryKey: ["care", "templates"] }));
  const save = useMutation({
    mutationFn: ({ id, t }: { id: string; t: { title: string; body: string } }) => (id === "new" ? api.post("/care/templates", t) : api.put(`/care/templates/${id}`, t)),
    onSuccess: () => (toast({ icon: "", title: "Saved reply saved" }), done()),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.del(`/care/templates/${id}`),
    onSuccess: () => (toast({ icon: "", title: "Saved reply deleted" }), done()),
  });
  const list = data?.templates ?? [];

  return (
    <Section
      title="Saved replies"
      id="care-templates"
      right={
        editing !== "new" && (
          <button className="btn-soft px-2.5 py-1 text-xs" onClick={() => setEditing("new")}>
            Add a reply
          </button>
        )
      }
    >
      <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">Answers to the questions buyers ask most. Copy one, then tweak it in Etsy if you need to.</p>
      {editing === "new" && (
        <div className="mb-3">
          <Editor initial={{ title: "", body: "" }} saving={save.isPending} onCancel={() => setEditing(null)} onSave={(t) => save.mutate({ id: "new", t })} />
        </div>
      )}
      {!data ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
      ) : list.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-200 px-3 py-6 text-center text-sm text-zinc-500 dark:border-white/10 dark:text-zinc-400">No saved replies yet.</p>
      ) : (
        <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-white/[0.06] dark:border-white/10">
          {list.map((t) =>
            editing === t.id ? (
              <li key={t.id} className="p-2">
                <Editor initial={t} saving={save.isPending} onCancel={() => setEditing(null)} onSave={(n) => save.mutate({ id: t.id, t: n })} />
              </li>
            ) : (
              <li key={t.id} className="px-3 py-2.5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button className="flex min-w-0 items-center gap-1.5 text-left font-medium" onClick={() => setOpen(open === t.id ? null : t.id)} aria-expanded={open === t.id}>
                    <Icon name="chevronRight" size={13} className={`shrink-0 text-zinc-400 transition ${open === t.id ? "rotate-90" : ""}`} />
                    <span className="truncate">{t.title}</span>
                  </button>
                  <div className="flex shrink-0 gap-1.5">
                    <CopyButton text={t.body} />
                    <button className="btn-soft px-2.5 py-1 text-xs" onClick={() => setEditing(t.id)}>
                      Edit
                    </button>
                    <button
                      className="btn-soft px-2 py-1 text-xs text-rose-700 dark:text-rose-300"
                      aria-label={`Delete ${t.title}`}
                      disabled={del.isPending}
                      onClick={() => confirm(`Delete "${t.title}"?`) && del.mutate(t.id)}
                    >
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                </div>
                {open === t.id && <p className="mt-2 whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">{t.body}</p>}
              </li>
            ),
          )}
        </ul>
      )}
      <div className="mt-2 space-y-2">
        <ErrorNote error={save.error} />
        <ErrorNote error={del.error} />
      </div>
    </Section>
  );
}
