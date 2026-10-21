// How each Etsy listing is doing: views, favourites and sales, a plain verdict, and what to do.
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useUi } from "../../lib/store";
import { timeAgo } from "../../lib/format";
import { ROOM_LABEL } from "../../lib/rooms";
import { ErrorNote, Section } from "../../components/ui";
import { Icon } from "../../components/Icon";
import type { RoomId } from "../../../shared/registry";

type Verdict = "new" | "star" | "steady" | "browsed" | "liked" | "hidden" | "off";

interface Listing {
  productId: string;
  title: string;
  url: string | null;
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
}

const TONE: Record<Verdict, { dot: string; text: string; label: string }> = {
  star: { dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-300", label: "Selling well" },
  steady: { dot: "bg-teal-500", text: "text-teal-700 dark:text-teal-300", label: "Selling" },
  browsed: { dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-300", label: "Looked at, not bought" },
  liked: { dot: "bg-violet-500", text: "text-violet-700 dark:text-violet-300", label: "Liked, not bought" },
  hidden: { dot: "bg-rose-500", text: "text-rose-700 dark:text-rose-300", label: "Hardly seen" },
  new: { dot: "bg-zinc-400", text: "text-zinc-600 dark:text-zinc-400", label: "Too new" },
  off: { dot: "bg-zinc-400", text: "text-zinc-600 dark:text-zinc-400", label: "Not live" },
};
const SUMMARY: Verdict[] = ["star", "steady", "browsed", "liked", "hidden", "new"];

/** Daily views for the last 30 days, as tiny bars. */
function Spark({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <svg viewBox={`0 0 ${values.length * 4} 24`} className="h-6 w-28" preserveAspectRatio="none" aria-hidden>
      {values.map((v, i) => (
        <rect key={i} x={i * 4} y={24 - Math.max(v ? 2 : 0.5, (v / max) * 24)} width={3} height={Math.max(v ? 2 : 0.5, (v / max) * 24)} rx={0.5} className={v ? "fill-indigo-400 dark:fill-indigo-400" : "fill-zinc-200 dark:fill-white/10"} />
      ))}
    </svg>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export function ListingPerformance() {
  const qc = useQueryClient();
  const toast = useUi((s) => s.toast);
  const { data } = useQuery({ queryKey: ["performance"], queryFn: () => api.get<{ listings: Listing[] }>("/strategy/performance") });
  const check = useMutation({
    mutationFn: () => api.post<{ checked: number }>("/live/check"),
    onSuccess: (r) => (toast({ icon: "", title: `Checked ${r.checked} listing${r.checked === 1 ? "" : "s"} on Etsy` }), qc.invalidateQueries({ queryKey: ["performance"] })),
  });
  const list = data?.listings ?? [];
  const checked = list.map((l) => l.checkedAt).filter(Boolean).sort().pop();

  return (
    <Section
      id="strategy-performance"
      title="Listing performance"
      right={
        <button className="btn-soft !px-2.5 !py-1 text-xs" onClick={() => check.mutate()} disabled={check.isPending}>
          <Icon name="refresh" size={13} />
          {check.isPending ? "Checking…" : "Check Etsy now"}
        </button>
      }
    >
      <div className="space-y-4 text-sm">
        <p className="text-zinc-600 dark:text-zinc-400">
          Views and favourites from Etsy (checked every 6 hours{checked ? `, last ${timeAgo(checked)}` : ""}), next to your real sales. Listings that need help come first.
        </p>
        <ErrorNote error={check.error} />
        {!data ? (
          <p className="text-zinc-500">Loading…</p>
        ) : !list.length ? (
          <p className="rounded-lg border border-dashed border-zinc-200 px-3 py-6 text-center text-zinc-500 dark:border-white/10 dark:text-zinc-400">
            Nothing on Etsy yet. Once you send products to Etsy from the Launch room and publish them, you'll see how each one is doing here.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {SUMMARY.map((v) => {
                const n = list.filter((l) => l.verdict === v).length;
                return n ? (
                  <span key={v} className="chip">
                    <span className={`h-1.5 w-1.5 rounded-full ${TONE[v].dot}`} aria-hidden />
                    {TONE[v].label} <b className="font-semibold tabular-nums">{n}</b>
                  </span>
                ) : null;
              })}
            </div>
            <ul className="divide-y divide-zinc-100 overflow-hidden rounded-lg border border-zinc-200 dark:divide-white/[0.06] dark:border-white/10">
              {list.map((l) => (
                <li key={l.productId} className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium">
                        {l.url ? (
                          <a href={l.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
                            {l.title} <Icon name="external" size={12} className="text-zinc-400" />
                          </a>
                        ) : (
                          l.title
                        )}
                      </div>
                      <div className={`mt-0.5 flex items-center gap-1.5 text-xs font-medium ${TONE[l.verdict].text}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${TONE[l.verdict].dot}`} aria-hidden />
                        {l.headline}
                      </div>
                    </div>
                    <div className="text-right">
                      <Spark values={l.daily} />
                      <div className="text-[10px] text-zinc-400">Views a day, last 30 days</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                    <Stat label="Views (30 days)" value={l.views30 !== null ? String(l.views30) : `${l.views} ever`} />
                    <Stat label="Views (7 days)" value={l.views7 !== null ? String(l.views7) : "—"} />
                    <Stat label="Favourites" value={l.favs30 !== null ? `${l.favs30} (30 days)` : String(l.favourites)} />
                    <Stat label="Sales (30 days)" value={String(l.sales30)} />
                    <Stat label="Views that buy" value={l.conversion !== null ? `${Math.round(l.conversion * 1000) / 10}%` : "—"} />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-zinc-50 px-3 py-2 dark:bg-white/[0.03]">
                    <span className="text-zinc-700 dark:text-zinc-300">{l.advice}</span>
                    {l.room && (
                      <Link to={`/room/${l.room}`} className="btn-soft shrink-0 !px-2.5 !py-1 text-xs">
                        Go to {ROOM_LABEL[l.room]} <Icon name="arrowRight" size={12} />
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Etsy only gives running totals, so the 7 and 30 day figures fill in as BinkSuite collects a daily reading. Etsy doesn't share where views came from.
            </p>
          </>
        )}
      </div>
    </Section>
  );
}
