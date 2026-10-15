import { eq, sql, type SQL, type Column } from "drizzle-orm";
import type { DB } from "../db";
import { kv } from "../db/schema";
import { settingsSchema, withDefaults, type Settings } from "../../shared/settings";

export const nowIso = (d: Date = new Date()) => d.toISOString();

export async function kvGet<T>(db: DB, key: string): Promise<T | null> {
  const row = await db.select().from(kv).where(eq(kv.key, key)).get();
  return row ? (JSON.parse(row.value) as T) : null;
}

export async function kvSet(db: DB, key: string, value: unknown): Promise<void> {
  const v = JSON.stringify(value);
  await db.insert(kv).values({ key, value: v }).onConflictDoUpdate({ target: kv.key, set: { value: v } });
}

export const GAME_CACHE_KEY = "gameCache";

/** Call after writing anything that changes XP, coins or quest progress. */
export async function invalidateStats(db: DB): Promise<void> {
  await db.delete(kv).where(eq(kv.key, GAME_CACHE_KEY));
}

export async function getSettings(db: DB): Promise<Settings> {
  return withDefaults(await kvGet<Partial<Settings>>(db, "settings"));
}

export async function saveSettings(db: DB, s: Settings): Promise<Settings> {
  const parsed = settingsSchema.parse(s);
  await kvSet(db, "settings", parsed);
  return parsed;
}

/**
 * Demo visibility filter. In demo mode everything is visible; otherwise
 * only real (demo = 0) rows count.
 */
export function visible(col: Column, demoMode: boolean): SQL | undefined {
  return demoMode ? undefined : eq(col, false);
}

export const sum = (col: Column) => sql<number>`coalesce(sum(${col}), 0)`.mapWith(Number);
export const count = () => sql<number>`count(*)`.mapWith(Number);
