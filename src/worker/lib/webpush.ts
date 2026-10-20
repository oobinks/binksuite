// Web Push (the standard behind phone and desktop notifications), with Web Crypto only:
// VAPID sign-in (RFC 8292) and "aes128gcm" payload encryption (RFC 8291).
import { b64url, fromB64url, randomBytes } from "./crypto";

export interface PushKeys {
  /** The public key browsers need to subscribe (uncompressed P-256 point, base64url). */
  publicKey: string;
  privateJwk: JsonWebKey;
}

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export async function newPushKeys(): Promise<PushKeys> {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const raw = (await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer;
  return { publicKey: b64url(raw), privateJwk: (await crypto.subtle.exportKey("jwk", pair.privateKey)) as JsonWebKey };
}

const enc = new TextEncoder();

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
}

/** The VAPID "Authorization" header for one push service. */
export async function vapidHeader(endpoint: string, keys: PushKeys, subject: string, now = Date.now()): Promise<string> {
  const header = b64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64url(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })));
  const key = await crypto.subtle.importKey("jwk", keys.privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${header}.${claims}`));
  return `vapid t=${header}.${claims}.${b64url(sig)}, k=${keys.publicKey}`;
}

/** Encrypt a message for one browser (RFC 8291, a single aes128gcm record). */
export async function encryptPayload(target: Pick<PushTarget, "p256dh" | "auth">, plaintext: Uint8Array): Promise<Uint8Array> {
  const uaPublic = fromB64url(target.p256dh);
  const authSecret = fromB64url(target.auth);
  const local = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const asPublic = new Uint8Array((await crypto.subtle.exportKey("raw", local.publicKey)) as ArrayBuffer);
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey } as unknown as SubtleCryptoDeriveKeyAlgorithm, local.privateKey, 256));

  const ikm = await hkdf(authSecret, shared, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = randomBytes(16);
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  // One record: the message, then the 0x02 "last record" delimiter.
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, concat(plaintext, new Uint8Array([2]))));
  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, 4096);
  return concat(salt, recordSize, new Uint8Array([asPublic.length]), asPublic, sealed);
}

export interface PushMessage {
  title: string;
  body: string;
  /** Where tapping the notification takes you. */
  url: string;
  /** Same tag = the newer notification replaces the older one. */
  tag?: string;
}

/** Send one notification. `gone` means the phone unsubscribed: forget it. */
export async function sendPush(target: PushTarget, msg: PushMessage, keys: PushKeys, subject: string, fetcher: typeof fetch = fetch): Promise<{ ok: boolean; gone: boolean; status: number }> {
  const body = await encryptPayload(target, enc.encode(JSON.stringify(msg)));
  const res = await fetcher(target.endpoint, {
    method: "POST",
    headers: {
      authorization: await vapidHeader(target.endpoint, keys, subject),
      "content-encoding": "aes128gcm",
      "content-type": "application/octet-stream",
      ttl: String(24 * 3600),
      urgency: "high",
    },
    body,
  });
  return { ok: res.ok, gone: res.status === 404 || res.status === 410, status: res.status };
}
