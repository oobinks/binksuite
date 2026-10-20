// Orders Desk: your real Etsy orders, read from your connected shop.
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useUi } from "../../lib/store";
import { formatGBP, timeAgo } from "../../lib/format";
import { ErrorNote, Section } from "../../components/ui";
import { Icon } from "../../components/Icon";

interface Order {
  receiptId: number;
  at: string;
  items: { title: string; listingId: number; productId: string | null; quantity: number; pricePence: number }[];
  totalPence: number;
  note: string | null;
}

interface OrdersResp {
  shop: { shopName: string } | null;
  state: { at: string } | null;
  orders: Order[];
}

export function OrdersDesk() {
  const qc = useQueryClient();
  const toast = useUi((s) => s.toast);
  const { data } = useQuery({ queryKey: ["orders"], queryFn: () => api.get<OrdersResp>("/orders"), refetchInterval: 60_000 });
  const sync = useMutation({
    mutationFn: () => api.post<{ added: number }>("/orders/sync"),
    onSuccess: (r) => {
      toast({ icon: "", title: r.added ? `${r.added} new order${r.added === 1 ? "" : "s"}` : "No new orders yet" });
      qc.invalidateQueries();
    },
  });
  if (!data) return <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>;
  if (!data.shop)
    return (
      <Section title="Orders">
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          Connect your Etsy shop in{" "}
          <Link to="/settings#etsy" className="font-medium text-accent underline dark:text-indigo-300">
            Settings → Your Etsy shop
          </Link>{" "}
          and your orders appear here by themselves. Each new sale is recorded in the Finance Vault (with Etsy's fees).
        </p>
      </Section>
    );
  const notes = data.orders.filter((o) => o.note);
  const week = data.orders.filter((o) => Date.now() - new Date(o.at).getTime() < 7 * 86_400_000);
  return (
    <div className="space-y-4">
      <Section
        title={`Orders from ${data.shop.shopName}`}
        right={
          <button className="btn-soft px-2.5 py-1 text-xs" onClick={() => sync.mutate()} disabled={sync.isPending}>
            <Icon name="refresh" size={13} /> {sync.isPending ? "Checking…" : "Check now"}
          </button>
        }
      >
        <div className="mb-4 grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-zinc-200 p-3 dark:border-white/10">
            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">This week</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">{week.length}</div>
          </div>
          <div className="rounded-lg border border-zinc-200 p-3 dark:border-white/10">
            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Takings this week</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">{formatGBP(week.reduce((a, o) => a + o.totalPence, 0))}</div>
          </div>
          <div className={`rounded-lg border p-3 ${notes.length ? "border-amber-300 dark:border-amber-500/40" : "border-zinc-200 dark:border-white/10"}`}>
            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Buyer notes</div>
            <div className={`mt-1 text-lg font-semibold tabular-nums ${notes.length ? "text-amber-700 dark:text-amber-300" : ""}`}>{notes.length}</div>
          </div>
        </div>
        <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
          Checks Etsy every 15 minutes{data.state?.at ? ` · last checked ${timeAgo(data.state.at)}` : ""}. Orders from before you connected aren't imported (add those in the Finance Vault if you need them).
        </p>
        {data.orders.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-200 px-3 py-6 text-center text-sm text-zinc-500 dark:border-white/10 dark:text-zinc-400">No orders since you connected yet. Your first one will appear here.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-white/[0.06] dark:border-white/10">
            {data.orders.map((o) => (
              <li key={o.receiptId} className="px-3 py-2.5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold tabular-nums">Order #{o.receiptId}</span>
                  <span className="text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
                    {new Date(o.at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} · <span className="font-semibold text-zinc-900 dark:text-zinc-100">{formatGBP(o.totalPence)}</span>
                  </span>
                </div>
                <ul className="mt-1.5 space-y-0.5 text-zinc-700 dark:text-zinc-300">
                  {o.items.map((i, k) => (
                    <li key={k} className="flex justify-between gap-2">
                      <span className="min-w-0 truncate">
                        {i.quantity > 1 ? `${i.quantity} × ` : ""}
                        {i.title}
                        {!i.productId && <span className="text-xs text-zinc-500 dark:text-zinc-400"> (not made in BinkSuite)</span>}
                      </span>
                      <span className="shrink-0 tabular-nums">{formatGBP(i.pricePence)}</span>
                    </li>
                  ))}
                </ul>
                {o.note && (
                  <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                    <span className="font-medium">Buyer's note:</span> {o.note}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2">
          <ErrorNote error={sync.error} />
        </div>
      </Section>
    </div>
  );
}
