// Single-owner password login. PBKDF2 hash, signed HttpOnly cookie, lockout.
import { eq } from "drizzle-orm";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { z } from "zod";
import { newApp, body, HttpError, type Ctx } from "../app";
import { owner } from "../db/schema";
import { secretsStatus } from "../env";
import { b64url, fromB64url, hashPassword, randomBytes, safeEqual, signSession, verifySession, PBKDF2_ITERATIONS } from "../lib/crypto";
import { getSettings, invalidateStats, nowIso } from "../lib/store";
import { recordEvent } from "../engine/game";
import { seedDemo } from "../../../seed/demo";
import type { DB } from "../db";

export const SESSION_COOKIE = "bs_session";
const SESSION_DAYS = 30;
const MAX_FAILS = 5;
export const MIN_PASSWORD = 10;

const passwordSchema = z.string().min(MIN_PASSWORD, `Use at least ${MIN_PASSWORD} characters`).max(200);

async function getOwner(db: DB) {
  return db.select().from(owner).where(eq(owner.id, 1)).get();
}

async function issueCookie(c: Ctx, version: number) {
  const token = await signSession({ exp: Date.now() + SESSION_DAYS * 86_400_000, v: version }, c.env.SESSION_SECRET!);
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
}

/** Returns true if the request carries a valid session for the current owner. */
export async function isAuthed(c: Ctx): Promise<boolean> {
  if (!secretsStatus(c.env).sessionSecret) return false;
  const payload = await verifySession(getCookie(c, SESSION_COOKIE), c.env.SESSION_SECRET!);
  if (!payload) return false;
  const o = await getOwner(c.get("db"));
  return !!o && o.sessionVersion === payload.v;
}

function requireSecrets(c: Ctx) {
  const s = secretsStatus(c.env);
  if (!s.sessionSecret || !s.vaultMasterKey) {
    throw new HttpError(503, "Secrets missing: set SESSION_SECRET and VAULT_MASTER_KEY in Cloudflare (see the setup page).");
  }
}

export const authRoutes = newApp()
  .get("/status", async (c) => {
    const db = c.get("db");
    const o = await getOwner(db);
    return c.json({ passwordSet: !!o, authed: await isAuthed(c), secrets: secretsStatus(c.env) });
  })
  .post("/setup", async (c) => {
    requireSecrets(c);
    const db = c.get("db");
    if (await getOwner(db)) throw new HttpError(409, "A password is already set. Log in instead.");
    const b = await body(c, z.object({ password: passwordSchema, setupCode: z.string().min(1) }));
    if (!safeEqual(b.setupCode.trim(), c.env.SESSION_SECRET!)) {
      throw new HttpError(403, "Setup code doesn't match your SESSION_SECRET. Paste the exact value you saved in Cloudflare.");
    }
    const salt = randomBytes(16);
    await db
      .insert(owner)
      .values({ id: 1, passwordHash: await hashPassword(b.password, salt), salt: b64url(salt), iterations: PBKDF2_ITERATIONS, createdAt: nowIso() })
      .onConflictDoNothing();
    const settings = await getSettings(db);
    if (settings.demoMode) await seedDemo(db, settings);
    await invalidateStats(db);
    await issueCookie(c, 1);
    await recordEvent(db, "login", settings.demoMode);
    return c.json({ ok: true });
  })
  .post("/login", async (c) => {
    requireSecrets(c);
    const db = c.get("db");
    const o = await getOwner(db);
    if (!o) throw new HttpError(409, "No password yet — open the setup page.");
    if (o.lockedUntil && new Date(o.lockedUntil) > new Date()) {
      const mins = Math.ceil((new Date(o.lockedUntil).getTime() - Date.now()) / 60_000);
      throw new HttpError(429, `Too many wrong passwords. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`);
    }
    const b = await body(c, z.object({ password: z.string().max(200) }));
    const hash = await hashPassword(b.password, fromB64url(o.salt), o.iterations);
    if (!safeEqual(hash, o.passwordHash)) {
      const fails = o.failedAttempts + 1;
      const lock = fails >= MAX_FAILS ? new Date(Date.now() + 15 * 60_000 * 2 ** Math.min(4, fails - MAX_FAILS)).toISOString() : null;
      await db.update(owner).set({ failedAttempts: fails, lockedUntil: lock }).where(eq(owner.id, 1));
      const left = MAX_FAILS - fails;
      throw new HttpError(401, left > 0 ? `Wrong password. ${left} tr${left === 1 ? "y" : "ies"} left before a short lockout.` : "Wrong password. Locked for a while.");
    }
    await db.update(owner).set({ failedAttempts: 0, lockedUntil: null }).where(eq(owner.id, 1));
    await issueCookie(c, o.sessionVersion);
    const settings = await getSettings(db);
    await recordEvent(db, "login", settings.demoMode);
    return c.json({ ok: true });
  })
  .post("/logout", (c) => {
    deleteCookie(c, SESSION_COOKIE, { path: "/", secure: true });
    return c.json({ ok: true });
  })
  .post("/password", async (c) => {
    requireSecrets(c);
    if (!(await isAuthed(c))) throw new HttpError(401, "Log in first");
    const db = c.get("db");
    const o = (await getOwner(db))!;
    const b = await body(c, z.object({ current: z.string(), next: passwordSchema }));
    if (!safeEqual(await hashPassword(b.current, fromB64url(o.salt), o.iterations), o.passwordHash)) {
      throw new HttpError(401, "Current password is wrong");
    }
    const salt = randomBytes(16);
    const version = o.sessionVersion + 1;
    await db
      .update(owner)
      .set({ passwordHash: await hashPassword(b.next, salt), salt: b64url(salt), iterations: PBKDF2_ITERATIONS, sessionVersion: version })
      .where(eq(owner.id, 1));
    await issueCookie(c, version);
    return c.json({ ok: true });
  })
  .post("/logout-all", async (c) => {
    if (!(await isAuthed(c))) throw new HttpError(401, "Log in first");
    const db = c.get("db");
    const o = (await getOwner(db))!;
    await db.update(owner).set({ sessionVersion: o.sessionVersion + 1 }).where(eq(owner.id, 1));
    deleteCookie(c, SESSION_COOKIE, { path: "/", secure: true });
    return c.json({ ok: true });
  });
