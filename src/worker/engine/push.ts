// Phone notifications: events drop a message in an outbox, and the outbox is sent
// after each request and on every scheduler run (the sender needs the vault key).
import { and, eq, sql } from "drizzle-orm";
import type { DB } from "../db";
import { approvals, vault } from "../db/schema";
import type { Env } from "../env";
import { kvGet, kvSet, nowIso } from "../lib/store";
import { decryptSecret, encryptSecret, newId } from "../lib/crypto";
import { newPushKeys, sendPush, type PushKeys, type PushMessage } from "../lib/webpush";

export type PushKind = "sales" | "approvals" | "reviews" | "renewals" | "reports";

export const PUSH_KINDS: { kind: PushKind; label: string; hint: string }[] = [
  { kind: "sales", label: "New Etsy sales", hint: "As soon as an order comes in." },
  { kind: "approvals", label: "Approvals waiting", hint: "At most once an hour." },
  { kind: "reviews", label: "1–3 star reviews", hint: "So you can reply quickly." },
  { kind: "renewals", label: "Listings about to expire", hint: "The keep-or-retire review, a week before." },
  { kind: "reports", label: "Weekly report ready", hint: "Monday mornings." },
];

export type PushPrefs = Record<PushKind, boolean>;
const DEFAULT_PREFS: PushPrefs = { sales: true, approvals: true, reviews: true, renewals: true, reports: true };

export interface PushDevice {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  label: string;
  createdAt: string;
}

interface Queued extends PushMessage {
  kind: PushKind;
}

const SUBS = "pushSubs";
const PREFS = "pushPrefs";
const OUTBOX = "pushOutbox";
const SUBJECT = "pushSubject";
const LAST_APPROVALS = "pushLastApprovals";
const VAULT_ID = "webpush";
const APPROVALS_EVERY_MS = 3_600_000;

export const pushDevices = async (db: DB) => (await kvGet<PushDevice[]>(db, SUBS)) ?? [];
export const pushPrefs = async (db: DB): Promise<PushPrefs> => ({ ...DEFAULT_PREFS, ...((await kvGet<Partial<PushPrefs>>(db, PREFS)) ?? {}) });
export const savePushPrefs = (db: DB, prefs: Partial<PushPrefs>) => kvSet(db, PREFS, prefs);

/** The signing keys, made once and kept encrypted in the Key Vault. */
export async function pushKeys(db: DB, env: Env): Promise<PushKeys | null> {
  if (!env.VAULT_MASTER_KEY) return null;
  const row = await db.select().from(vault).where(eq(vault.provider, VAULT_ID)).get();
  if (row) {
    try {
      return JSON.parse(await decryptSecret(row.ciphertext, row.iv, env.VAULT_MASTER_KEY)) as PushKeys;
    } catch {
      // The master key changed: make new keys (phones will need to turn notifications on again).
    }
  }
  const keys = await newPushKeys();
  const { ciphertext, iv } = await encryptSecret(JSON.stringify(keys), env.VAULT_MASTER_KEY);
  const fresh = { provider: VAULT_ID, ciphertext, iv, last4: keys.publicKey.slice(-4), updatedAt: nowIso() };
  await db.insert(vault).values(fresh).onConflictDoUpdate({ target: vault.provider, set: fresh });
  // Phones subscribed with the old keys can't be reached any more.
  if (row) await kvSet(db, SUBS, []);
  return keys;
}

export async function addPushDevice(db: DB, sub: { endpoint: string; p256dh: string; auth: string }, label: string, origin: string): Promise<PushDevice> {
  const list = (await pushDevices(db)).filter((d) => d.endpoint !== sub.endpoint);
  const device = { id: newId("d_"), ...sub, label: label.slice(0, 60) || "Phone", createdAt: nowIso() };
  await kvSet(db, SUBS, [...list, device].slice(-10));
  // Push services want to know who's sending: the site's own address will do.
  await kvSet(db, SUBJECT, origin);
  return device;
}

export async function removePushDevice(db: DB, match: { id?: string; endpoint?: string }) {
  const list = await pushDevices(db);
  await kvSet(
    db,
    SUBS,
    list.filter((d) => d.id !== match.id && d.endpoint !== match.endpoint),
  );
}

/** Line up a notification. Demo things never ping your phone. */
export async function queuePush(db: DB, kind: PushKind, msg: PushMessage) {
  if (!(await pushDevices(db)).length) return;
  const box = (await kvGet<Queued[]>(db, OUTBOX)) ?? [];
  await kvSet(db, OUTBOX, [...box, { kind, ...msg }].slice(-20));
}

/** Send everything waiting in the outbox to every phone that's turned on. */
export async function flushPushes(db: DB, env: Env, now = new Date(), fetcher: typeof fetch = fetch): Promise<number> {
  const box = await kvGet<Queued[]>(db, OUTBOX);
  if (!box?.length) return 0;
  await kvSet(db, OUTBOX, []);
  const [devices, prefs, keys, subject] = await Promise.all([pushDevices(db), pushPrefs(db), pushKeys(db, env), kvGet<string>(db, SUBJECT)]);
  if (!devices.length || !keys) return 0;

  const out: PushMessage[] = box.filter((m) => prefs[m.kind] && m.kind !== "approvals");
  // Approvals: one gentle summary, at most once an hour.
  if (prefs.approvals && box.some((m) => m.kind === "approvals")) {
    const last = await kvGet<string>(db, LAST_APPROVALS);
    if (!last || now.getTime() - new Date(last).getTime() >= APPROVALS_EVERY_MS) {
      const waiting = await db
        .select({ n: sql<number>`count(*)`.mapWith(Number) })
        .from(approvals)
        .where(and(eq(approvals.status, "pending"), eq(approvals.demo, false)))
        .get();
      const n = waiting?.n ?? 0;
      if (n > 0) {
        out.push({ title: `${n} thing${n === 1 ? "" : "s"} waiting for you`, body: "Open BinkSuite to review and approve.", url: "/", tag: "approvals" });
        await kvSet(db, LAST_APPROVALS, now.toISOString());
      }
    }
  }

  let sent = 0;
  const gone = new Set<string>();
  for (const msg of out)
    for (const d of devices) {
      if (gone.has(d.id)) continue;
      try {
        const r = await sendPush(d, msg, keys, subject ?? "mailto:noreply@binksuite.app", fetcher);
        if (r.ok) sent++;
        if (r.gone) gone.add(d.id);
      } catch (e) {
        console.error("push", e);
      }
    }
  if (gone.size) await kvSet(db, SUBS, devices.filter((d) => !gone.has(d.id)));
  return sent;
}

/** "Send a test": straight to every phone, ignoring preferences. */
export async function sendTestPush(db: DB, env: Env, fetcher: typeof fetch = fetch) {
  const [devices, keys, subject] = await Promise.all([pushDevices(db), pushKeys(db, env), kvGet<string>(db, SUBJECT)]);
  if (!keys) throw new Error("Set the VAULT_MASTER_KEY secret first.");
  const results = [];
  for (const d of devices) {
    try {
      const r = await sendPush(d, { title: "BinkSuite notifications are on", body: "You'll get a ping like this when something needs you.", url: "/settings#notifications", tag: "test" }, keys, subject ?? "mailto:noreply@binksuite.app", fetcher);
      if (r.gone) await removePushDevice(db, { id: d.id });
      results.push({ label: d.label, ok: r.ok, status: r.status });
    } catch (e) {
      results.push({ label: d.label, ok: false, status: 0, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return results;
}
