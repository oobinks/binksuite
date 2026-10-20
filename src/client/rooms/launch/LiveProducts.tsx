// Your products on Etsy: state, days left before the listing expires, views and favourites.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { formatGBP, timeAgo } from "../../lib/format";
import { useUi } from "../../lib/store";
import { ErrorNote, Section } from "../../components/ui";
import { Icon } from "../../components/Icon";

interface LiveRow {
  id: string;
  title: string;
  pricePence: number | null;
  stage: string;
  listingId: number;
  editUrl: string;
  live: { state: string; endsAt: string | null; views: number; favourites: number; checkedAt: string; url?: string } | null;
}

const DAY = 86_400_000;
/** Etsy listings last 4 months. */
const LIFE_DAYS = 122;
const STATE: Record<string, { label: string; dot: string }> = {
  active: { label: "Live", dot: "bg-emerald-500" },
  draft: { label: "Draft", dot: "bg-zinc-400" },
  expired: { label: "Expired", dot: "bg-rose-500" },
  inactive: { label: "Inactive", dot: "bg-amber-500" },
  sold_out: { label: "Sold out", dot: "bg-zinc-400" },
};

export function LiveProducts() {
  const qc = useQueryClient();
  const toast = useUi((s) => s.toast);
  const { data } = useQuery({ queryKey: ["live"], queryFn: () => api.get<{ products: LiveRow[] }>("/live"), refetchInterval: 120_000 });
  const check = useMutation({
    mutationFn: () => api.post<{ checked: number; reviews: number }>("/live/check"),
    onSuccess: (r) => (toast({ icon: "", title: `Checked ${r.checked} listing${r.checked === 1 ? "" : "s"} on Etsy`, body: r.reviews ? `${r.reviews} need a keep-or-retire decision` : undefined }), qc.invalidateQueries()),
  });
  if (!data?.products.length) return null;
  const rows = [...data.products].sort((a, b) => (a.live?.endsAt ?? "9").localeCompare(b.live?.endsAt ?? "9"));
  return (
    <Section
      title="On Etsy"
      right={
        <button className="btn-soft px-2.5 py-1 text-xs" onClick={() => check.mutate()} disabled={check.isPending}>
          <Icon name="refresh" size={13} /> {check.isPending ? "Checking…" : "Check now"}
        </button>
      }
    >
      <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">Listings last 4 months and don't renew by themselves. A week before one expires, you'll get a keep-or-retire review.</p>
      <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-white/[0.06] dark:border-white/10">
        {rows.map((p) => {
          const left = p.live?.endsAt ? Math.max(0, Math.ceil((new Date(p.live.endsAt).getTime() - Date.now()) / DAY)) : null;
          const pct = left === null ? 0 : Math.min(100, (left / LIFE_DAYS) * 100);
          const urgent = left !== null && left <= 1;
          const soon = left !== null && left <= 7;
          const tone = urgent ? "bg-rose-500" : soon ? "bg-amber-500" : "bg-zinc-400 dark:bg-zinc-500";
          const daysTone = urgent ? "text-rose-600 dark:text-rose-400" : soon ? "text-amber-600 dark:text-amber-400" : "text-zinc-900 dark:text-zinc-100";
          const st = STATE[p.live?.state ?? "draft"];
          return (
            <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3 py-2.5 text-sm">
              <div className="min-w-0 flex-1 basis-48">
                <a className="block truncate font-medium hover:underline" href={p.live?.state === "active" && p.live.url ? p.live.url : p.editUrl} target="_blank" rel="noreferrer">
                  {p.title}
                </a>
                {p.live?.state === "active" && left !== null ? (
                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
                    <span>Expires {new Date(p.live.endsAt!).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                    {p.pricePence ? <span>{formatGBP(p.pricePence)}</span> : null}
                    <span>{p.live.favourites} favourites</span>
                    <span>{p.live.views} views</span>
                  </div>
                ) : (
                  <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    {p.live ? `Checked ${timeAgo(p.live.checkedAt)}.` : "Not checked yet."} {p.live?.state === "draft" || !p.live ? "Publish it on Etsy and the countdown starts." : ""}
                  </div>
                )}
              </div>
              <span className="chip inline-flex shrink-0 items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${st?.dot ?? "bg-zinc-400"}`} aria-hidden />
                {st?.label ?? p.live?.state}
              </span>
              {p.live?.state === "active" && left !== null && (
                <div className="w-24 shrink-0 text-right">
                  <div className={`text-sm font-semibold tabular-nums ${daysTone}`}>
                    {left} <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">day{left === 1 ? "" : "s"} left</span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-zinc-200/80 dark:bg-white/10">
                    <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="mt-2">
        <ErrorNote error={check.error} />
      </div>
    </Section>
  );
}
