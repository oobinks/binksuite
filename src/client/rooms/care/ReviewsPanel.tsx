// Your shop's latest Etsy reviews. Concierge drafts a public response; you post it on Etsy.
import { useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useUi } from "../../lib/store";
import { timeAgo } from "../../lib/format";
import { ErrorNote, Section, Spinner } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { CopyButton } from "../shared/CopyButton";
import { useDraft } from "./useDraft";
import { PendingNote } from "./notes";

interface Review {
  key: string;
  listingId: number;
  rating: number;
  review: string;
  at: string;
  product: { id: string; title: string } | null;
  respondedAt: string | null;
  needsReply: boolean;
}

interface ReviewsResp {
  connected: boolean;
  shop: { shopName: string } | null;
  at: string | null;
  reviews: Review[];
  needsReply: number;
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-1.5" aria-label={`${rating} out of 5 stars`}>
      <span className="flex gap-0.5" aria-hidden>
        {[1, 2, 3, 4, 5].map((i) => (
          <Icon key={i} name="star" size={13} strokeWidth={1.5} className={i <= rating ? "fill-amber-400 text-amber-400" : "fill-zinc-200 text-zinc-200 dark:fill-white/15 dark:text-white/15"} />
        ))}
      </span>
      <span className="text-xs font-semibold tabular-nums">{rating}/5</span>
    </span>
  );
}

function ReviewRow({ r }: { r: Review }) {
  const qc = useQueryClient();
  const d = useDraft(`/care/reviews/${encodeURIComponent(r.key)}/draft`);
  const mark = useMutation({
    mutationFn: (responded: boolean) => api.post(`/care/reviews/${encodeURIComponent(r.key)}/responded`, { responded }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["care", "reviews"] }),
  });
  return (
    <li className="px-3 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Stars rating={r.rating} />
          {r.needsReply && (
            <span className="chip inline-flex items-center gap-1.5 text-amber-800 dark:text-amber-200">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Needs a reply
            </span>
          )}
          {r.respondedAt && (
            <span className="chip inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
              <Icon name="check" size={12} /> Responded
            </span>
          )}
        </div>
        <span className="text-xs text-zinc-500 tabular-nums dark:text-zinc-400">{new Date(r.at).toLocaleDateString("en-GB", { dateStyle: "medium" })}</span>
      </div>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{r.product ? r.product.title : `Etsy listing ${r.listingId}`}</p>
      <p className="mt-1.5 whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">{r.review || <span className="italic text-zinc-500 dark:text-zinc-400">No written review, just a rating.</span>}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button className="btn-soft inline-flex items-center gap-1.5 px-2.5 py-1 text-xs" disabled={d.busy} onClick={() => (d.text ? d.rewrite({}) : d.draft({}))}>
          {d.busy ? <Spinner /> : <Icon name={d.text ? "refresh" : "sparkles"} size={13} />} {d.text ? "Rewrite" : "Draft a response"}
        </button>
        <button className="btn-soft px-2.5 py-1 text-xs" disabled={mark.isPending} onClick={() => mark.mutate(!r.respondedAt)}>
          {r.respondedAt ? "Mark as not responded" : "Mark as responded"}
        </button>
      </div>
      {(d.pending || d.error || d.text) && (
        <div className="mt-2 space-y-2">
          {d.pending && <PendingNote />}
          <ErrorNote error={d.error} />
          <ErrorNote error={mark.error} />
          {d.text && (
            <>
              <textarea className="input min-h-24 w-full" value={d.text} onChange={(e) => d.setText(e.target.value)} aria-label="Draft response" />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Post it on Etsy: Shop Manager → Reviews → Respond. BinkSuite never posts for you.</p>
                <CopyButton text={d.text} />
              </div>
            </>
          )}
        </div>
      )}
    </li>
  );
}

export function ReviewsPanel() {
  const qc = useQueryClient();
  const toast = useUi((s) => s.toast);
  const [onlyNeeds, setOnlyNeeds] = useState(false);
  const { data, error } = useQuery({ queryKey: ["care", "reviews"], queryFn: () => api.get<ReviewsResp>("/care/reviews") });
  const sync = useMutation({
    mutationFn: () => api.post<{ count: number }>("/care/reviews/sync"),
    onSuccess: (r) => {
      toast({ icon: "", title: r.count ? `${r.count} recent review${r.count === 1 ? "" : "s"} checked` : "No reviews yet" });
      qc.invalidateQueries({ queryKey: ["care", "reviews"] });
    },
  });

  if (!data) return <Section title="Reviews">{error ? <ErrorNote error={error} /> : <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>}</Section>;
  if (!data.connected)
    return (
      <Section title="Reviews" id="care-reviews">
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          Connect your Etsy shop in{" "}
          <Link to="/settings#etsy" className="font-medium text-accent underline dark:text-indigo-300">
            Settings → Your Etsy shop
          </Link>{" "}
          to see your latest reviews here, with a drafted response for each one.
        </p>
      </Section>
    );

  const shown = onlyNeeds ? data.reviews.filter((r) => r.needsReply) : data.reviews;
  return (
    <Section
      title={data.needsReply ? `Reviews · ${data.needsReply} need${data.needsReply === 1 ? "s" : ""} a reply` : "Reviews"}
      id="care-reviews"
      right={
        <button className="btn-soft px-2.5 py-1 text-xs" onClick={() => sync.mutate()} disabled={sync.isPending}>
          <Icon name="refresh" size={13} /> {sync.isPending ? "Checking…" : "Check for new reviews"}
        </button>
      }
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          The latest 25 reviews of {data.shop?.shopName}
          {data.at ? ` · last checked ${timeAgo(data.at)}` : ""}. Reviews of 1 to 3 stars are flagged so you can respond.
        </p>
        {data.needsReply > 0 && (
          <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300">
            <input type="checkbox" checked={onlyNeeds} onChange={(e) => setOnlyNeeds(e.target.checked)} /> Only ones needing a reply
          </label>
        )}
      </div>
      <ErrorNote error={sync.error} />
      {!data.at ? (
        <p className="rounded-lg border border-dashed border-zinc-200 px-3 py-6 text-center text-sm text-zinc-500 dark:border-white/10 dark:text-zinc-400">Press "Check for new reviews" to fetch them from Etsy.</p>
      ) : shown.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-200 px-3 py-6 text-center text-sm text-zinc-500 dark:border-white/10 dark:text-zinc-400">{onlyNeeds ? "Nothing needs a reply." : "No reviews yet."}</p>
      ) : (
        <ul className="mt-2 divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-white/[0.06] dark:border-white/10">
          {shown.map((r) => (
            <ReviewRow key={r.key} r={r} />
          ))}
        </ul>
      )}
    </Section>
  );
}
