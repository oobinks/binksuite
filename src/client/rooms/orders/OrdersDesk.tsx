// 🧾 Orders Desk: your real Etsy orders, read from your connected shop.
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useUi } from "../../lib/store";
import { formatGBP, timeAgo } from "../../lib/format";
import { ErrorNote, Section } from "../../components/ui";

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
      toast({ icon: "🧾", title: r.added ? `${r.added} new order${r.added === 1 ? "" : "s"}!` : "No new orders yet" });
      qc.invalidateQueries();
    },
  });
  if (!data) return <p>Loading…</p>;
  if (!data.shop)
    return (
      <Section title="Orders" icon="🧾">
        <p className="text-sm">
          Connect your Etsy shop in{" "}
          <Link to="/settings#etsy" className="font-bold underline">
            Settings → Your Etsy shop
          </Link>{" "}
          and your orders appear here by themselves. Each new sale is recorded in the Finance Vault (with Etsy's fees), earns coins and XP, and gets a celebration.
        </p>
      </Section>
    );
  const notes = data.orders.filter((o) => o.note);
  const week = data.orders.filter((o) => Date.now() - new Date(o.at).getTime() < 7 * 86_400_000);
  return (
    <div className="space-y-4">
      <Section
        title={`Orders from ${data.shop.shopName}`}
        icon="🧾"
        right={
          <button className="btn-soft !py-1 text-xs" onClick={() => sync.mutate()} disabled={sync.isPending}>
            {sync.isPending ? "Checking…" : "🔄 Check now"}
          </button>
        }
      >
        <div className="mb-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-black/5 p-2 dark:bg-white/5">
            <div className="text-xs font-bold">This week</div>
            <div className="text-xl font-black">{week.length}</div>
          </div>
          <div className="rounded-xl bg-black/5 p-2 dark:bg-white/5">
            <div className="text-xs font-bold">Takings this week</div>
            <div className="text-xl font-black">{formatGBP(week.reduce((a, o) => a + o.totalPence, 0))}</div>
          </div>
          <div className={`rounded-xl p-2 ${notes.length ? "bg-honey/25" : "bg-black/5 dark:bg-white/5"}`}>
            <div className="text-xs font-bold">Buyer notes</div>
            <div className="text-xl font-black">{notes.length}</div>
          </div>
        </div>
        <p className="mb-2 text-xs text-cocoa dark:text-stone-400">
          Checks Etsy every 15 minutes{data.state?.at ? ` · last checked ${timeAgo(data.state.at)}` : ""}. Orders from before you connected aren't imported (add those in the Finance Vault if you need them).
        </p>
        {data.orders.length === 0 ? (
          <p className="text-sm text-cocoa dark:text-stone-400">No orders since you connected yet. Your first one will land here with a celebration. 🎉</p>
        ) : (
          <ul className="space-y-2">
            {data.orders.map((o) => (
              <li key={o.receiptId} className="rounded-xl bg-white p-2.5 text-sm ring-1 ring-black/5 dark:bg-night-3 dark:ring-white/10">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-black">Order #{o.receiptId}</span>
                  <span className="text-xs text-cocoa dark:text-stone-400">
                    {new Date(o.at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} · <b>{formatGBP(o.totalPence)}</b>
                  </span>
                </div>
                <ul className="mt-1 space-y-0.5">
                  {o.items.map((i, k) => (
                    <li key={k} className="flex justify-between gap-2">
                      <span className="min-w-0 truncate">
                        {i.quantity > 1 ? `${i.quantity} × ` : ""}
                        {i.title}
                        {!i.productId && <span className="text-xs text-cocoa dark:text-stone-400"> (not made in BinkSuite)</span>}
                      </span>
                      <span className="shrink-0 tabular-nums">{formatGBP(i.pricePence)}</span>
                    </li>
                  ))}
                </ul>
                {o.note && <p className="mt-1 rounded-lg bg-honey/20 p-1.5 text-xs">📝 Buyer's note: {o.note}</p>}
              </li>
            ))}
          </ul>
        )}
        <ErrorNote error={sync.error} />
      </Section>
    </div>
  );
}
