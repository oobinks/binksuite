// One listing: how it's doing, its sales and reviews, and editing its words and price on Etsy.
import type { ProductFormat } from "../../shared/format";
import { hasPhotoNote, PHOTO_NOTE } from "../../shared/compliance";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useUi } from "../lib/store";
import { formatGBP, timeAgo, toPence } from "../lib/format";
import { ROOM_LABEL } from "../lib/rooms";
import { PageHeader } from "../components/PageHeader";
import { ErrorNote, Modal, Section } from "../components/ui";
import { Icon } from "../components/Icon";
import { ArtImage } from "../components/ArtImage";
import { seoCheck } from "../../shared/seo";
import { ETSY_LIMITS } from "../../shared/compliance";
import type { RoomId } from "../../shared/registry";
import { STATE_LABEL } from "./ShopPage";
import { VERDICT_TONE, type Verdict } from "./verdicts";

/** Puts Etsy's photo note in the "Please note" list if there is one, otherwise at the end. */
function withPhotoNote(description: string, format: keyof typeof PHOTO_NOTE): string {
  const note = PHOTO_NOTE[format] ?? PHOTO_NOTE.pdf;
  const at = description.indexOf("✦ PLEASE NOTE");
  if (at >= 0) {
    const eol = description.indexOf("\n", at);
    return eol < 0 ? `${description}\n• ${note}` : `${description.slice(0, eol)}\n• ${note}${description.slice(eol)}`;
  }
  return `${description.trimEnd()}\n\n${note}`;
}

interface Detail {
  productId: string;
  format: ProductFormat;
  listingId: number;
  title: string;
  description: string;
  tags: string[];
  pricePence: number | null;
  state: string;
  url: string | null;
  editUrl: string;
  images: string[];
  imagesFull: string[];
  localImages: string[];
  endsAt: string | null;
  launchedAt: string | null;
  fromEtsy: boolean;
  etsyError: string | null;
  performance: {
    views: number;
    favourites: number;
    views7: number | null;
    views30: number | null;
    favs30: number | null;
    sales30: number;
    salesTotal: number;
    conversion: number | null;
    verdict: Verdict;
    headline: string;
    advice: string;
    room: RoomId | null;
    daily: number[];
    checkedAt: string | null;
  } | null;
  orders: { receiptId: number; at: string; totalPence: number; note: string | null; items: { title: string; quantity: number; pricePence: number }[] }[];
  revenuePence: number;
  salesCount: number;
  reviews: { key: string; rating: number; review: string; at: string }[];
}

type Tab = "overview" | "edit" | "sales" | "reviews";

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-white/10">
      <div className="text-xs text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-zinc-400">{hint}</div>}
    </div>
  );
}

function Bars({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <svg viewBox={`0 0 ${values.length * 6} 40`} className="h-16 w-full" preserveAspectRatio="none" aria-label="Views a day, last 30 days">
      {values.map((v, i) => {
        const h = v ? Math.max(2, (v / max) * 40) : 1;
        return <rect key={i} x={i * 6} y={40 - h} width={4.5} height={h} rx={1} className={v ? "fill-indigo-400" : "fill-zinc-200 dark:fill-white/10"} />;
      })}
    </svg>
  );
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Icon key={i} name="star" size={14} strokeWidth={1.5} className={i <= rating ? "fill-amber-400 text-amber-400" : "fill-zinc-200 text-zinc-200 dark:fill-white/15 dark:text-white/15"} />
      ))}
    </span>
  );
}

export function ShopListingPage() {
  const { id } = useParams();
  const { data, error } = useQuery({ queryKey: ["shop", id], queryFn: () => api.get<Detail>(`/shop/listings/${id}`) });
  const [tab, setTab] = useState<Tab>("overview");
  if (error) return <ErrorNote error={error} />;
  if (!data) return <p className="py-20 text-center text-sm text-zinc-500">Loading from Etsy…</p>;
  const st = STATE_LABEL[data.state] ?? { label: data.state, dot: "bg-zinc-400" };
  const daysLeft = data.endsAt ? Math.max(0, Math.ceil((new Date(data.endsAt).getTime() - Date.now()) / 86_400_000)) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={data.title.split("|")[0].trim()}
        back="/shop"
        crumb="My shop"
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
              {st.label}
            </span>
            {data.pricePence !== null && <span>{formatGBP(data.pricePence)}</span>}
            {daysLeft !== null && data.state === "active" && <span className={daysLeft <= 7 ? "font-medium text-amber-600 dark:text-amber-400" : ""}>Expires in {daysLeft} days</span>}
          </span>
        }
        right={
          <>
            {data.url && (
              <a className="btn-soft" href={data.url} target="_blank" rel="noreferrer">
                View on Etsy <Icon name="external" size={14} />
              </a>
            )}
            <a className="btn-soft" href={data.editUrl} target="_blank" rel="noreferrer">
              Photos and files on Etsy <Icon name="external" size={14} />
            </a>
          </>
        }
      />
      {data.etsyError && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          Couldn't read the latest from Etsy: {data.etsyError.replace(/\.$/, "")}. Showing BinkSuite's copy; editing needs Etsy.
        </p>
      )}

      <div className="flex gap-1 border-b border-zinc-200 dark:border-white/10" role="tablist">
        {(
          [
            ["overview", "Overview"],
            ["edit", "Edit listing"],
            ["sales", `Sales (${data.orders.length || data.salesCount})`],
            ["reviews", `Reviews (${data.reviews.length})`],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${tab === t ? "border-accent text-zinc-900 dark:border-indigo-400 dark:text-white" : "border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" && <Overview d={data} />}
      {tab === "edit" && <EditListing d={data} />}
      {tab === "sales" && <Sales d={data} />}
      {tab === "reviews" && <Reviews d={data} />}
    </div>
  );
}

function Overview({ d }: { d: Detail }) {
  const p = d.performance;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {p?.views30 !== null && p?.views30 !== undefined ? <Stat label="Views (30 days)" value={String(p.views30)} hint={`${p.views} all time`} /> : <Stat label="Views" value={String(p?.views ?? 0)} hint="all time (30-day figure builds up daily)" />}
        <Stat label="Favourites" value={String(p?.favs30 ?? p?.favourites ?? 0)} hint={p?.favs30 !== null && p?.favs30 !== undefined ? "last 30 days" : "all time"} />
        <Stat label="Sales" value={String(d.salesCount)} hint={`${formatGBP(d.revenuePence)} revenue`} />
        <Stat label="Views that buy" value={p?.conversion !== null && p?.conversion !== undefined ? `${Math.round(p.conversion * 1000) / 10}%` : "—"} hint="sales ÷ views" />
      </div>
      {p && (
        <Section title="How it's doing" right={p.checkedAt ? <span className="chip">Checked {timeAgo(p.checkedAt)}</span> : undefined}>
          <div className="space-y-4 text-sm">
            <div className={`flex items-center gap-1.5 font-medium ${VERDICT_TONE[p.verdict].text}`}>
              <span className={`h-2 w-2 rounded-full ${VERDICT_TONE[p.verdict].dot}`} />
              {p.headline}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-zinc-50 px-3 py-2 dark:bg-white/[0.03]">
              <span className="text-zinc-700 dark:text-zinc-300">{p.advice}</span>
              {p.room && (
                <Link to={`/room/${p.room}`} className="btn-soft shrink-0 !px-2.5 !py-1 text-xs">
                  Go to {ROOM_LABEL[p.room]} <Icon name="arrowRight" size={12} />
                </Link>
              )}
            </div>
            <div>
              <div className="mb-1 text-xs text-zinc-500 dark:text-zinc-400">Views a day, last 30 days</div>
              <Bars values={p.daily} />
            </div>
          </div>
        </Section>
      )}
      <Section title="Photos">
        {d.images.length ? (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {d.images.map((src, i) => (
              <img key={src} src={src} alt={`Listing photo ${i + 1}`} className="h-28 w-36 shrink-0 cursor-zoom-in rounded-lg border border-zinc-200 object-cover dark:border-white/10" loading="lazy" data-zoom={d.imagesFull[i] ?? ""} />
            ))}
          </div>
        ) : d.localImages.length ? (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {d.localImages.map((k) => (
              <ArtImage key={k} imageKey={k} className="h-28 w-36 shrink-0 rounded-lg" />
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">No photos found.</p>
        )}
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">To change photos or the download files, use “Photos and files on Etsy” at the top.</p>
      </Section>
    </div>
  );
}

function EditListing({ d }: { d: Detail }) {
  const qc = useQueryClient();
  const toast = useUi((s) => s.toast);
  const [title, setTitle] = useState(d.title);
  const [description, setDescription] = useState(d.description);
  const [tags, setTags] = useState<string[]>(d.tags);
  const [tagInput, setTagInput] = useState("");
  const [price, setPrice] = useState(d.pricePence !== null ? (d.pricePence / 100).toFixed(2) : "");
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    setTitle(d.title);
    setDescription(d.description);
    setTags(d.tags);
    setPrice(d.pricePence !== null ? (d.pricePence / 100).toFixed(2) : "");
  }, [d]);

  const seo = useMemo(() => seoCheck({ title, tags, description }), [title, tags, description]);
  const pricePence = price.trim() ? toPence(price) : null;
  const changed = title !== d.title || description !== d.description || tags.join("|") !== d.tags.join("|") || (pricePence !== null && pricePence !== d.pricePence);
  const problems = [
    title.length > ETSY_LIMITS.titleMax && `Title is ${title.length - ETSY_LIMITS.titleMax} characters too long.`,
    title.trim().length < 10 && "Title is too short.",
    tags.some((t) => t.length > ETSY_LIMITS.tagCharsMax) && `Tags can be up to ${ETSY_LIMITS.tagCharsMax} characters.`,
    description.trim().length < 20 && "Description is too short.",
    price.trim() && (pricePence === null || pricePence < 20) && "Enter a price like 4.99.",
  ].filter(Boolean) as string[];

  const addTag = () => {
    const parts = tagInput
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    if (!parts.length) return;
    setTags((cur) => [...new Set([...cur, ...parts])].slice(0, ETSY_LIMITS.tagsMax));
    setTagInput("");
  };

  const save = useMutation({
    mutationFn: () => api.put(`/shop/listings/${d.productId}`, { title: title.trim(), description: description.trim(), tags, ...(pricePence !== null ? { pricePence } : {}) }),
    onSuccess: () => {
      setConfirming(false);
      toast({ icon: "", title: "Saved to Etsy", body: "Your listing has been updated." });
      qc.invalidateQueries({ queryKey: ["shop"] });
    },
  });

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="card space-y-4 p-4 sm:p-5 lg:col-span-2">
        {!d.fromEtsy && <p className="text-sm text-amber-700 dark:text-amber-300">Etsy couldn't be reached, so this shows BinkSuite's copy. Saving needs Etsy.</p>}
        <label className="block">
          <span className="label flex justify-between">
            <span>Title</span>
            <span className={title.length > ETSY_LIMITS.titleMax ? "text-rose-600" : ""}>
              {title.length}/{ETSY_LIMITS.titleMax}
            </span>
          </span>
          <textarea className="input min-h-20" value={title} onChange={(e) => setTitle(e.target.value.replace(/\n/g, " "))} />
        </label>
        <div>
          <span className="label flex justify-between">
            <span>Tags</span>
            <span>
              {tags.length}/{ETSY_LIMITS.tagsMax}
            </span>
          </span>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <span key={t} className={`chip !py-1 ${t.length > ETSY_LIMITS.tagCharsMax ? "!border-rose-300 !text-rose-700" : ""}`}>
                {t}
                <button type="button" onClick={() => setTags(tags.filter((x) => x !== t))} aria-label={`Remove ${t}`} className="text-zinc-400 hover:text-zinc-700">
                  <Icon name="close" size={12} />
                </button>
              </span>
            ))}
          </div>
          {tags.length < ETSY_LIMITS.tagsMax && (
            <div className="mt-2 flex gap-2">
              <input
                className="input"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === ",") && (e.preventDefault(), addTag())}
                placeholder="Add a tag, e.g. budget planner"
                maxLength={40}
              />
              <button type="button" className="btn-soft shrink-0" onClick={addTag}>
                Add
              </button>
            </div>
          )}
        </div>
        <label className="block">
          <span className="label">Price (£)</span>
          <input className="input !w-36" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
        <label className="block">
          <span className="label">Description</span>
          <textarea className="input min-h-72 font-[inherit] leading-relaxed" value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        {!hasPhotoNote(description) && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            <Icon name="alert" size={15} className="shrink-0" />
            <span className="min-w-0 flex-1">Etsy's AI rules (October 2026) ask you to say how your listing photos were made. This description doesn't yet.</span>
            <button type="button" className="btn-soft shrink-0" onClick={() => setDescription(withPhotoNote(description, d.format))}>
              Add photo note
            </button>
          </div>
        )}
        {problems.length > 0 && (
          <ul className="space-y-1 text-sm text-rose-700 dark:text-rose-300">
            {problems.map((p) => (
              <li key={p} className="flex items-center gap-1.5">
                <Icon name="alert" size={14} /> {p}
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-3 border-t border-zinc-100 pt-4 dark:border-white/[0.06]">
          <button className="btn-primary" disabled={!changed || problems.length > 0 || !d.fromEtsy} onClick={() => setConfirming(true)}>
            Save to Etsy
          </button>
          {changed && (
            <button
              className="btn-soft"
              onClick={() => {
                setTitle(d.title);
                setDescription(d.description);
                setTags(d.tags);
                setPrice(d.pricePence !== null ? (d.pricePence / 100).toFixed(2) : "");
              }}
            >
              Undo changes
            </button>
          )}
          {!changed && <span className="text-xs text-zinc-500">No changes yet.</span>}
        </div>
      </div>
      <Section title={`Search check: ${seo.score}%`}>
        <ul className="space-y-2 text-sm">
          {seo.checks.map((c) => (
            <li key={c.key} className="flex gap-2">
              <Icon name={c.pass ? "check" : "alert"} size={15} className={`mt-0.5 ${c.pass ? "text-emerald-600" : "text-amber-600"}`} />
              <span>
                <span className="font-medium">{c.label}</span>
                {!c.pass && <span className="block text-xs text-zinc-500 dark:text-zinc-400">{c.tip}</span>}
              </span>
            </li>
          ))}
        </ul>
      </Section>
      <Modal open={confirming} onClose={() => setConfirming(false)} title="Save these changes to Etsy?">
        <p className="text-sm text-zinc-600 dark:text-zinc-300">{d.state === "active" ? "This listing is live, so buyers will see the changes straight away." : "This updates the listing on Etsy."}</p>
        <ErrorNote error={save.error} />
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-soft" onClick={() => setConfirming(false)}>
            Cancel
          </button>
          <button className="btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Yes, save to Etsy"}
          </button>
        </div>
      </Modal>
    </div>
  );
}

function Sales({ d }: { d: Detail }) {
  if (!d.orders.length)
    return <p className="card p-6 text-center text-sm text-zinc-500 dark:text-zinc-400">{d.salesCount ? `${d.salesCount} sale${d.salesCount === 1 ? "" : "s"} in your records (${formatGBP(d.revenuePence)}), but no Etsy orders synced for it yet.` : "No sales yet."}</p>;
  return (
    <div className="card overflow-hidden">
      <ul className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
        {d.orders.map((o) => (
          <li key={o.receiptId} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3 text-sm">
            <div>
              <div className="font-medium">Order #{o.receiptId}</div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                {new Date(o.at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </div>
              {o.note && <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">Buyer's note: “{o.note}”</div>}
            </div>
            <div className="text-right tabular-nums">
              {o.items.map((i, k) => (
                <div key={k}>
                  {i.quantity} × {formatGBP(i.pricePence)}
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <div className="border-t border-zinc-100 px-4 py-3 text-sm dark:border-white/[0.06]">
        Total from this listing: <span className="font-semibold tabular-nums">{formatGBP(d.revenuePence)}</span>
      </div>
    </div>
  );
}

function Reviews({ d }: { d: Detail }) {
  if (!d.reviews.length) return <p className="card p-6 text-center text-sm text-zinc-500 dark:text-zinc-400">No reviews for this listing yet. New reviews are checked every 6 hours.</p>;
  return (
    <div className="card overflow-hidden">
      <ul className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
        {d.reviews.map((r) => (
          <li key={r.key} className="space-y-1.5 px-4 py-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <Stars rating={r.rating} />
              <span className="text-xs text-zinc-400">{timeAgo(r.at)}</span>
            </div>
            <p className="whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">{r.review || <span className="italic text-zinc-500">No written review, just a rating.</span>}</p>
          </li>
        ))}
      </ul>
      <div className="border-t border-zinc-100 px-4 py-3 dark:border-white/[0.06]">
        <Link to="/room/care" className="btn-soft !px-2.5 !py-1 text-xs">
          Draft a response in Customer Care <Icon name="arrowRight" size={12} />
        </Link>
      </div>
    </div>
  );
}
