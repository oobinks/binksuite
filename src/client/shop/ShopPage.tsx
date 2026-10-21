// My shop: every listing sent to Etsy, at a glance. Click one to see and edit it.
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useUi } from "../lib/store";
import { formatGBP, timeAgo } from "../lib/format";
import { PageHeader } from "../components/PageHeader";
import { ErrorNote } from "../components/ui";
import { Icon } from "../components/Icon";
import { ArtImage } from "../components/ArtImage";
import { FormatBadge } from "../components/FormatBadge";
import type { ProductFormat } from "../../shared/format";
import { VERDICT_TONE, type Verdict } from "./verdicts";

export interface ShopListing {
  productId: string;
  listingId: number;
  title: string;
  format: ProductFormat;
  pricePence: number | null;
  cover: string | null;
  state: string;
  daysLeft: number | null;
  views: number;
  favourites: number;
  views30: number | null;
  sales30: number;
  salesTotal: number;
  verdict: Verdict | null;
  headline: string | null;
  url: string | null;
  checkedAt: string | null;
}

export const STATE_LABEL: Record<string, { label: string; dot: string }> = {
  active: { label: "Live", dot: "bg-emerald-500" },
  draft: { label: "Draft", dot: "bg-zinc-400" },
  inactive: { label: "Paused", dot: "bg-amber-500" },
  expired: { label: "Expired", dot: "bg-rose-500" },
  sold_out: { label: "Sold out", dot: "bg-rose-500" },
};

export function ShopPage() {
  const qc = useQueryClient();
  const toast = useUi((s) => s.toast);
  const { data, error } = useQuery({ queryKey: ["shop"], queryFn: () => api.get<{ connected: boolean; listings: ShopListing[] }>("/shop/listings") });
  const check = useMutation({
    mutationFn: () => api.post<{ checked: number }>("/live/check"),
    onSuccess: (r) => (toast({ icon: "", title: `Checked ${r.checked} listing${r.checked === 1 ? "" : "s"} on Etsy` }), qc.invalidateQueries({ queryKey: ["shop"] })),
  });
  const list = data?.listings ?? [];
  const live = list.filter((l) => l.state === "active").length;
  const checked = list.map((l) => l.checkedAt).filter(Boolean).sort().pop();

  return (
    <div className="space-y-6">
      <PageHeader
        title="My shop"
        icon="store"
        tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300"
        subtitle={data ? `${live} live listing${live === 1 ? "" : "s"}${list.length > live ? `, ${list.length - live} other${list.length - live === 1 ? "" : "s"}` : ""}. Click one to see how it's doing or edit it.` : "Your Etsy listings."}
        right={
          <button className="btn-soft" onClick={() => check.mutate()} disabled={check.isPending || !data?.connected}>
            <Icon name="refresh" size={15} />
            {check.isPending ? "Checking…" : "Check Etsy now"}
          </button>
        }
      />
      <ErrorNote error={error ?? check.error} />
      {data && !data.connected && (
        <p className="card p-4 text-sm">
          Connect your Etsy shop in{" "}
          <Link to="/settings#etsy" className="font-medium underline">
            Settings → Your Etsy shop
          </Link>{" "}
          to see and edit your listings here.
        </p>
      )}
      {data && data.connected && !list.length && (
        <p className="card p-6 text-center text-sm text-zinc-500 dark:text-zinc-400">Nothing sent to Etsy yet. Products appear here once you send them from the Launch room.</p>
      )}
      {!!list.length && (
        <div className="card overflow-hidden">
          <div className="hidden grid-cols-[minmax(0,1fr)_90px_90px_90px_90px_110px_24px] gap-4 border-b border-zinc-100 px-4 py-2.5 text-[11px] font-semibold tracking-[0.06em] text-zinc-500 uppercase md:grid dark:border-white/[0.06]">
            <span>Listing</span>
            <span className="text-right">Price</span>
            <span className="text-right">Views (30d)</span>
            <span className="text-right">Favourites</span>
            <span className="text-right">Sales</span>
            <span className="text-right">Expires</span>
            <span />
          </div>
          <ul className="divide-y divide-zinc-100 dark:divide-white/[0.06]">
            {list.map((l) => {
              const st = STATE_LABEL[l.state] ?? { label: l.state, dot: "bg-zinc-400" };
              return (
                <li key={l.productId}>
                  <Link to={`/shop/${l.productId}`} className="grid grid-cols-[minmax(0,1fr)_24px] items-center gap-4 px-4 py-3 transition-colors hover:bg-zinc-50 md:grid-cols-[minmax(0,1fr)_90px_90px_90px_90px_110px_24px] dark:hover:bg-white/[0.03]">
                    <span className="flex min-w-0 items-center gap-3">
                      <ArtImage imageKey={l.cover} className="h-12 w-16 shrink-0 rounded-md" label={l.title} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{l.title}</span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                          <span className="inline-flex items-center gap-1.5">
                            <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                            {st.label}
                          </span>
                          <FormatBadge format={l.format} />
                          {l.verdict && <span className={VERDICT_TONE[l.verdict].text}>{l.headline}</span>}
                          <span className="md:hidden">
                            {l.pricePence ? formatGBP(l.pricePence) : ""} · {l.views30 ?? l.views} views · {l.salesTotal} sales
                          </span>
                        </span>
                      </span>
                    </span>
                    <span className="hidden text-right text-sm tabular-nums md:block">{l.pricePence ? formatGBP(l.pricePence) : "—"}</span>
                    <span className="hidden text-right text-sm tabular-nums md:block">{l.views30 ?? l.views}</span>
                    <span className="hidden text-right text-sm tabular-nums md:block">{l.favourites}</span>
                    <span className="hidden text-right text-sm tabular-nums md:block">{l.salesTotal}</span>
                    <span className={`hidden text-right text-sm tabular-nums md:block ${l.state === "active" && l.daysLeft !== null && l.daysLeft <= 7 ? "font-semibold text-amber-600 dark:text-amber-400" : ""}`}>{l.state !== "active" ? st.label : l.daysLeft !== null ? `${l.daysLeft} days` : "—"}</span>
                    <Icon name="chevronRight" size={16} className="text-zinc-400" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {checked && <p className="text-xs text-zinc-400">Views and favourites last read from Etsy {timeAgo(checked)}. Etsy is checked every 6 hours.</p>}
    </div>
  );
}
