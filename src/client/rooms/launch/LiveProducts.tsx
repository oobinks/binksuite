// ⏳ Your products on Etsy: state, days left before the listing expires, views and favourites.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { formatGBP, timeAgo } from "../../lib/format";
import { useUi } from "../../lib/store";
import { ErrorNote, Section } from "../../components/ui";

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
const STATE: Record<string, string> = { active: "🟢 Live", draft: "📝 Draft", expired: "⌛ Expired", inactive: "⏸️ Inactive", sold_out: "Sold out" };

export function LiveProducts() {
  const qc = useQueryClient();
  const toast = useUi((s) => s.toast);
  const { data } = useQuery({ queryKey: ["live"], queryFn: () => api.get<{ products: LiveRow[] }>("/live"), refetchInterval: 120_000 });
  const check = useMutation({
    mutationFn: () => api.post<{ checked: number; reviews: number }>("/live/check"),
    onSuccess: (r) => (toast({ icon: "⏳", title: `Checked ${r.checked} listing${r.checked === 1 ? "" : "s"} on Etsy`, body: r.reviews ? `${r.reviews} need a keep-or-retire decision` : undefined }), qc.invalidateQueries()),
  });
  if (!data?.products.length) return null;
  const rows = [...data.products].sort((a, b) => (a.live?.endsAt ?? "9").localeCompare(b.live?.endsAt ?? "9"));
  return (
    <Section
      title="On Etsy"
      icon="⏳"
      right={
        <button className="btn-soft !py-1 text-xs" onClick={() => check.mutate()} disabled={check.isPending}>
          {check.isPending ? "Checking…" : "🔄 Check now"}
        </button>
      }
    >
      <p className="mb-2 text-xs text-cocoa dark:text-stone-400">Listings last 4 months and don't renew by themselves. A week before one expires, you'll get a keep-or-retire review.</p>
      <ul className="space-y-2">
        {rows.map((p) => {
          const left = p.live?.endsAt ? Math.max(0, Math.ceil((new Date(p.live.endsAt).getTime() - Date.now()) / DAY)) : null;
          const pct = left === null ? 0 : Math.min(100, (left / LIFE_DAYS) * 100);
          const tone = left === null ? "bg-black/20" : left <= 7 ? "bg-rose-500" : left <= 30 ? "bg-amber-400" : "bg-emerald-500";
          return (
            <li key={p.id} className="rounded-xl bg-white p-2.5 text-sm ring-1 ring-black/5 dark:bg-night-3 dark:ring-white/10">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <a className="min-w-0 flex-1 truncate font-bold hover:underline" href={p.live?.state === "active" && p.live.url ? p.live.url : p.editUrl} target="_blank" rel="noreferrer">
                  {p.title}
                </a>
                <span className="chip shrink-0">{STATE[p.live?.state ?? "draft"] ?? p.live?.state}</span>
              </div>
              {p.live?.state === "active" && left !== null ? (
                <>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                    <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-1 flex flex-wrap justify-between gap-2 text-xs text-cocoa dark:text-stone-400">
                    <span className={left <= 7 ? "font-black text-rose-600 dark:text-rose-300" : ""}>
                      {left} day{left === 1 ? "" : "s"} left (expires {new Date(p.live.endsAt!).toLocaleDateString("en-GB", { day: "numeric", month: "short" })})
                    </span>
                    <span>
                      {p.pricePence ? `${formatGBP(p.pricePence)} · ` : ""}♥ {p.live.favourites} · 👁 {p.live.views}
                    </span>
                  </div>
                </>
              ) : (
                <div className="mt-1 text-xs text-cocoa dark:text-stone-400">
                  {p.live ? `Checked ${timeAgo(p.live.checkedAt)}.` : "Not checked yet."} {p.live?.state === "draft" || !p.live ? "Publish it on Etsy and the countdown starts." : ""}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <ErrorNote error={check.error} />
    </Section>
  );
}
