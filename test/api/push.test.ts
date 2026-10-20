// Phone notifications: the encryption a phone can read, the VAPID sign-in, and what gets sent when.
import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { getDb } from "../../src/worker/db";
import { b64url, fromB64url } from "../../src/worker/lib/crypto";
import { encryptPayload, newPushKeys, vapidHeader } from "../../src/worker/lib/webpush";
import { flushPushes, pushDevices, queuePush } from "../../src/worker/engine/push";
import { setUpOwner } from "./helpers";

/** A pretend phone: its keys, and how it reads a message (RFC 8291, receiver side). */
async function fakePhone() {
  const pair = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const pub = new Uint8Array((await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer);
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const hkdf = async (salt: Uint8Array, ikm: Uint8Array, info: string | Uint8Array, n: number) => {
    const k = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
    const i = typeof info === "string" ? new TextEncoder().encode(info) : info;
    return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info: i }, k, n * 8));
  };
  return {
    keys: { p256dh: b64url(pub), auth: b64url(auth) },
    async read(body: Uint8Array) {
      const salt = body.slice(0, 16);
      const idLen = body[20];
      const asPublic = body.slice(21, 21 + idLen);
      const sealed = body.slice(21 + idLen);
      const asKey = await crypto.subtle.importKey("raw", asPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
      const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: asKey } as unknown as SubtleCryptoDeriveKeyAlgorithm, pair.privateKey, 256));
      const info = new Uint8Array([...new TextEncoder().encode("WebPush: info\0"), ...pub, ...asPublic]);
      const ikm = await hkdf(auth, shared, info, 32);
      const cek = await hkdf(salt, ikm, "Content-Encoding: aes128gcm\0", 16);
      const nonce = await hkdf(salt, ikm, "Content-Encoding: nonce\0", 12);
      const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
      const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, sealed));
      expect(plain[plain.length - 1]).toBe(2);
      return JSON.parse(new TextDecoder().decode(plain.slice(0, -1)));
    },
  };
}

describe("web push", () => {
  it("encrypts so the phone can read it", async () => {
    const phone = await fakePhone();
    const body = await encryptPayload(phone.keys, new TextEncoder().encode(JSON.stringify({ title: "New sale", body: "Budget planner" })));
    expect(await phone.read(body)).toEqual({ title: "New sale", body: "Budget planner" });
  });

  it("signs a VAPID header the push service can check", async () => {
    const keys = await newPushKeys();
    const h = await vapidHeader("https://fcm.googleapis.com/fcm/send/abc", keys, "https://binksuite.test");
    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(h)!;
    expect(m[4]).toBe(keys.publicKey);
    const claims = JSON.parse(new TextDecoder().decode(fromB64url(m[2])));
    expect(claims.aud).toBe("https://fcm.googleapis.com");
    expect(claims.sub).toBe("https://binksuite.test");
    const pub = await crypto.subtle.importKey("raw", fromB64url(keys.publicKey), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, fromB64url(m[3]), new TextEncoder().encode(`${m[1]}.${m[2]}`));
    expect(ok).toBe(true);
  });

  it("turns on a device, sends what you asked for, and forgets phones that unsubscribed", async () => {
    const c = await setUpOwner();
    const db = getDb(env.DB);
    const state = (await c.get("/api/push")).data;
    expect(state.ready).toBe(true);
    expect(state.publicKey).toMatch(/^[A-Za-z0-9_-]{80,}$/);

    const phone = await fakePhone();
    const other = await fakePhone();
    expect((await c.post("/api/push/devices", { endpoint: "https://push.example/phone", keys: phone.keys, label: "iPhone" })).status).toBe(200);
    expect((await c.post("/api/push/devices", { endpoint: "https://push.example/old", keys: other.keys, label: "Old phone" })).status).toBe(200);
    await c.put("/api/push/prefs", { reviews: false });

    await queuePush(db, "sales", { title: "New sale: £4.99", body: "Budget planner", url: "/room/orders", tag: "sales" });
    await queuePush(db, "reviews", { title: "New 2-star review", body: "Meh", url: "/room/care" });
    const got: { url: string; msg: unknown; auth: string }[] = [];
    const fetcher = (async (url: string, init: RequestInit) => {
      got.push({ url, msg: url.endsWith("/phone") ? await phone.read(new Uint8Array(init.body as Uint8Array)) : null, auth: (init.headers as Record<string, string>).authorization });
      return new Response(null, { status: url.endsWith("/old") ? 410 : 201 });
    }) as unknown as typeof fetch;
    expect(await flushPushes(db, env as any, new Date(), fetcher)).toBe(1);
    // Reviews are switched off, so only the sale went out (to both phones).
    expect(got.map((g) => g.url).sort()).toEqual(["https://push.example/old", "https://push.example/phone"]);
    expect(got.find((g) => g.url.endsWith("/phone"))!.msg).toMatchObject({ title: "New sale: £4.99", url: "/room/orders" });
    expect(got[0].auth).toMatch(/^vapid t=.+, k=/);
    // The 410 phone is forgotten; the outbox is empty.
    expect((await pushDevices(db)).map((d) => d.label)).toEqual(["iPhone"]);
    expect(await flushPushes(db, env as any, new Date(), fetcher)).toBe(0);
  });

  it("sums up approvals at most once an hour", async () => {
    await setUpOwner();
    const db = getDb(env.DB);
    const phone = await fakePhone();
    const { addPushDevice } = await import("../../src/worker/engine/push");
    await addPushDevice(db, { endpoint: "https://push.example/a", ...phone.keys }, "iPhone", "https://binksuite.test");
    await env.DB.prepare("INSERT INTO approvals (id, task_id, kind, summary, status, demo, created_at) VALUES ('a1', 't1', 'review', 'x', 'pending', 0, ?), ('a2', 't2', 'review', 'y', 'pending', 0, ?)")
      .bind(new Date().toISOString(), new Date().toISOString())
      .run();
    const titles: string[] = [];
    const fetcher = (async (_u: string, init: RequestInit) => (titles.push((await phone.read(new Uint8Array(init.body as Uint8Array))).title), new Response(null, { status: 201 }))) as unknown as typeof fetch;
    const t0 = new Date();
    await queuePush(db, "approvals", { title: "Waiting", body: "a", url: "/" });
    await queuePush(db, "approvals", { title: "Waiting", body: "b", url: "/" });
    await flushPushes(db, env as any, t0, fetcher);
    expect(titles).toEqual(["2 things waiting for you"]);
    await queuePush(db, "approvals", { title: "Waiting", body: "c", url: "/" });
    await flushPushes(db, env as any, new Date(t0.getTime() + 10 * 60_000), fetcher);
    expect(titles).toHaveLength(1);
    await queuePush(db, "approvals", { title: "Waiting", body: "d", url: "/" });
    await flushPushes(db, env as any, new Date(t0.getTime() + 61 * 60_000), fetcher);
    expect(titles).toHaveLength(2);
  });
});
