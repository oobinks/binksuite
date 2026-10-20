// Customer Care: Concierge drafts replies to buyers and reviews. You always send.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { ErrorNote, Section, Spinner } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { CopyButton } from "../shared/CopyButton";
import { useDraft } from "./useDraft";
import { NeverSends, PendingNote } from "./notes";
import { SavedReplies } from "./SavedReplies";
import { ReviewsPanel } from "./ReviewsPanel";

interface CareProduct {
  id: string;
  title: string;
  format: string;
  stage: string;
}

function ReplyDrafter() {
  const { data } = useQuery({ queryKey: ["care", "products"], queryFn: () => api.get<{ products: CareProduct[] }>("/care/products") });
  const [message, setMessage] = useState("");
  const [productId, setProductId] = useState("");
  const [note, setNote] = useState("");
  const d = useDraft("/care/reply");
  const inputs = () => ({ message, productId: productId || null, note: note.trim() || null });
  const products = data?.products ?? [];

  return (
    <Section title="Reply to a buyer" id="care-reply">
      <ol className="space-y-4">
        <li>
          <label className="label" htmlFor="care-msg">
            1. Paste the buyer's message
          </label>
          <textarea
            id="care-msg"
            className="input mt-1 min-h-28 w-full"
            placeholder="Copy the message from Etsy Messages and paste it here"
            value={message}
            maxLength={4000}
            onChange={(e) => setMessage(e.target.value)}
          />
        </li>
        <li className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="care-product">
              2. Which product? (optional)
            </label>
            <select id="care-product" className="input mt-1 w-full" value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">Not about one product</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
            {data && products.length === 0 && <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Your products appear here once you've made some.</p>}
          </div>
          <div>
            <label className="label" htmlFor="care-note">
              3. What you'd like to say (optional)
            </label>
            <input id="care-note" className="input mt-1 w-full" placeholder="e.g. Happy to resend the files" value={note} maxLength={600} onChange={(e) => setNote(e.target.value)} />
          </div>
        </li>
        <li>
          <button className="btn-primary inline-flex items-center gap-1.5" disabled={!message.trim() || d.busy} onClick={() => d.draft(inputs())}>
            {d.busy ? <Spinner /> : <Icon name="sparkles" size={14} />} {d.busy ? "Writing…" : "Draft a reply"}
          </button>
        </li>
      </ol>

      <div className="mt-4 space-y-3">
        {d.pending && <PendingNote />}
        <ErrorNote error={d.error} />
        {d.text && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="label">Concierge's draft (you can edit it)</span>
              <div className="flex gap-2">
                <button className="btn-soft inline-flex items-center gap-1.5 px-2.5 py-1 text-xs" disabled={d.busy} onClick={() => d.rewrite(inputs())}>
                  <Icon name="refresh" size={13} /> Rewrite
                </button>
                <CopyButton text={d.text} />
              </div>
            </div>
            <textarea className="input min-h-40 w-full" value={d.text} onChange={(e) => d.setText(e.target.value)} aria-label="Draft reply" />
            <NeverSends />
          </div>
        )}
      </div>
    </Section>
  );
}

export function CareDesk() {
  return (
    <div className="space-y-4">
      <ReplyDrafter />
      <ReviewsPanel />
      <SavedReplies />
    </div>
  );
}
