// 🧾 Orders Desk: your real Etsy orders, read from your connected shop (official API).
// Each new paid order is recorded once in Finance (sale + estimated Etsy fees), with
// coins, XP and a celebration, and kept here so you can see buyers' notes.
import { sql } from "drizzle-orm";
import type { DB } from "../db";
import { products } from "../db/schema";
import type { Settings } from "../../shared/settings";
import { kvGet, kvSet, nowIso } from "../lib/store";
import { toGbpPence } from "../providers/etsy";
import type { ShopClient } from "../providers/etsyShop";
import { logActivity, recordSale } from "./queue";
import { queuePush } from "./push";
import { formatGBP } from "../../shared/fees";

export interface OrderItem {
  title: string;
  listingId: number;
  productId: string | null;
  quantity: number;
  pricePence: number;
}

export interface Order {
  receiptId: number;
  at: string;
  items: OrderItem[];
  totalPence: number;
  /** A note the buyer left (e.g. for a personalised order). */
  note: string | null;
}

interface SyncState {
  /** Etsy timestamps (seconds) of the newest order read. */
  lastCreated: number;
  seen: number[];
  at: string;
}

const KEEP_ORDERS = 200;
const SYNC_EVERY_MS = 15 * 60_000;

export const ordersList = async (db: DB) => (await kvGet<Order[]>(db, "etsyOrders")) ?? [];
export const ordersState = (db: DB) => kvGet<SyncState>(db, "etsyOrdersSync");

/** Read new paid orders since last time and record each one once. Returns how many were new. */
export async function syncOrders(db: DB, settings: Settings, shop: ShopClient, opts: { now?: Date; force?: boolean } = {}): Promise<number> {
  const now = opts.now ?? new Date();
  const state = (await ordersState(db)) ?? {
    // Start from when you connected, so sales you typed in by hand aren't counted twice.
    lastCreated: Math.floor(new Date(shop.shop.connectedAt).getTime() / 1000),
    seen: [],
    at: "",
  };
  if (!opts.force && state.at && now.getTime() - new Date(state.at).getTime() < SYNC_EVERY_MS) return 0;
  const r = await shop.receipts(state.lastCreated, 50);
  const seen = new Set(state.seen);
  const orders = await ordersList(db);
  let added = 0;
  for (const rec of r.results) {
    state.lastCreated = Math.max(state.lastCreated, rec.created_timestamp);
    if (seen.has(rec.receipt_id) || !rec.is_paid) continue;
    seen.add(rec.receipt_id);
    const at = new Date(rec.created_timestamp * 1000).toISOString();
    const items: OrderItem[] = [];
    for (const t of rec.transactions) {
      const unit = toGbpPence(t.price, settings.fees.usdToGbp) ?? 0;
      const match = await db
        .select({ id: products.id })
        .from(products)
        .where(sql`json_extract(${products.data}, '$.etsy.listingId') = ${t.listing_id}`)
        .get();
      const item = { title: t.title, listingId: t.listing_id, productId: match?.id ?? null, quantity: t.quantity, pricePence: unit * t.quantity };
      items.push(item);
      if (item.pricePence > 0)
        await recordSale(db, settings, { pricePence: item.pricePence, description: t.title.slice(0, 120), productId: item.productId, demo: false, date: at, nonGbp: t.price.currency_code !== "GBP" });
    }
    orders.unshift({ receiptId: rec.receipt_id, at, items, totalPence: items.reduce((a, i) => a + i.pricePence, 0), note: rec.message_from_buyer?.trim() || null });
    added++;
  }
  state.seen = [...seen].slice(-1000);
  state.at = nowIso(now);
  await kvSet(db, "etsyOrdersSync", state);
  if (added) {
    await kvSet(db, "etsyOrders", orders.slice(0, KEEP_ORDERS));
    await logActivity(db, "crafter", "orders", "new", `🧾 ${added} new Etsy order${added === 1 ? "" : "s"}`, false);
    const fresh = orders.slice(0, added);
    const total = fresh.reduce((a, o) => a + o.totalPence, 0);
    await queuePush(db, "sales", {
      title: added === 1 ? `New sale: ${formatGBP(total)}` : `${added} new sales: ${formatGBP(total)}`,
      body: fresh.flatMap((o) => o.items.map((i) => i.title)).slice(0, 3).join(", ").slice(0, 160) || "A new Etsy order came in.",
      url: "/room/orders",
      tag: "sales",
    });
  }
  return added;
}
