// Settings, Key Vault, quests/achievements, demo controls, export, storage gauge.
import { eq } from "drizzle-orm";
import { z } from "zod";
import { newApp, body, HttpError } from "../app";
import { schema } from "../db";
import { vault } from "../db/schema";
import { secretsStatus } from "../env";
import { encryptSecret } from "../lib/crypto";
import { nowIso, saveSettings, kvGet, invalidateStats } from "../lib/store";
import { feeSettingsSchema, settingsSchema, VAULT_PROVIDERS, type Settings } from "../../shared/settings";
import { claimQuest, getQuests, listAchievements, recordEvent, notify } from "../engine/game";
import { clearDemoData, seedDemo } from "../../../seed/demo";

const R2_FREE_BYTES = 10 * 1024 ** 3;

export const settingsRoutes = newApp()
  .get("/settings", (c) => c.json(c.get("settings")))
  .put("/settings", async (c) => {
    const patch = await body(c, settingsSchema.partial().extend({ fees: feeSettingsSchema.partial().optional() }));
    const db = c.get("db");
    const before = c.get("settings");
    const merged: Settings = {
      ...before,
      ...patch,
      fees: { ...before.fees, ...(patch.fees ?? {}) },
      agentsEnabled: { ...before.agentsEnabled, ...(patch.agentsEnabled ?? {}) },
    };
    const saved = await saveSettings(db, merged);
    await recordEvent(db, "settings_saved", saved.demoMode);
    return c.json(saved);
  })

  // ─── Key Vault ───
  .get("/vault", async (c) => {
    const rows = await c.get("db").select({ provider: vault.provider, last4: vault.last4, updatedAt: vault.updatedAt }).from(vault).all();
    return c.json({ ready: secretsStatus(c.env).vaultMasterKey, providers: VAULT_PROVIDERS, keys: rows });
  })
  .put("/vault/:provider", async (c) => {
    const provider = c.req.param("provider");
    if (!VAULT_PROVIDERS.some((p) => p.id === provider)) throw new HttpError(404, "Unknown provider");
    if (!secretsStatus(c.env).vaultMasterKey) throw new HttpError(503, "Set the VAULT_MASTER_KEY secret first.");
    const b = await body(c, z.object({ key: z.string().trim().min(8, "That key looks too short").max(500) }));
    const { ciphertext, iv } = await encryptSecret(b.key, c.env.VAULT_MASTER_KEY!);
    const row = { provider, ciphertext, iv, last4: b.key.slice(-4), updatedAt: nowIso() };
    await c.get("db").insert(vault).values(row).onConflictDoUpdate({ target: vault.provider, set: row });
    // Only the last 4 characters ever leave the Worker.
    return c.json({ provider, last4: row.last4, updatedAt: row.updatedAt });
  })
  .delete("/vault/:provider", async (c) => {
    await c.get("db").delete(vault).where(eq(vault.provider, c.req.param("provider")));
    return c.json({ ok: true });
  })

  // ─── Quests & achievements ───
  .get("/quests", async (c) => c.json({ quests: await getQuests(c.get("db"), c.get("settings").demoMode) }))
  .post("/quests/:id/claim", async (c) => {
    const db = c.get("db");
    const demoMode = c.get("settings").demoMode;
    try {
      const q = await claimQuest(db, c.req.param("id"), demoMode);
      await notify(db, "quest", `${q.icon} Quest complete: ${q.title}`, `+${q.xp} XP`, demoMode);
      return c.json({ ok: true, xp: q.xp });
    } catch (e) {
      throw new HttpError(400, e instanceof Error ? e.message : "Can't claim that");
    }
  })
  .get("/achievements", async (c) => c.json({ achievements: await listAchievements(c.get("db"), c.get("settings").demoMode) }))

  // ─── Demo controls ───
  .post("/demo/reset", async (c) => {
    const db = c.get("db");
    const s = await saveSettings(db, { ...c.get("settings"), demoMode: true });
    await seedDemo(db, s);
    await invalidateStats(db);
    return c.json({ ok: true });
  })
  .post("/demo/clear", async (c) => {
    const db = c.get("db");
    await clearDemoData(db);
    await saveSettings(db, { ...c.get("settings"), demoMode: false });
    await invalidateStats(db);
    return c.json({ ok: true });
  })

  // ─── Export & storage ───
  .get("/export", async (c) => {
    const db = c.get("db");
    const tables = ["products", "tasks", "approvals", "activity", "handoffs", "ledger", "events", "xpLog", "questClaims", "achievements", "notifications"] as const;
    const data: Record<string, unknown> = { exportedAt: nowIso(), app: "BinkSuite", settings: c.get("settings"), lastBriefing: await kvGet(db, "lastBriefing") };
    for (const t of tables) data[t] = await db.select().from(schema[t]).all();
    // API keys are never exported, not even encrypted.
    c.header("Content-Disposition", `attachment; filename="binksuite-export-${nowIso().slice(0, 10)}.json"`);
    return c.json(data);
  })
  .get("/storage", async (c) => {
    let bytes = 0;
    let objects = 0;
    let cursor: string | undefined;
    // Listing is cheap; we cap pages so a huge bucket can't blow the request budget.
    for (let page = 0; page < 10; page++) {
      const list = await c.env.FILES.list({ cursor, limit: 1000 });
      for (const o of list.objects) {
        bytes += o.size;
        objects++;
      }
      if (!list.truncated) break;
      cursor = list.truncated ? list.cursor : undefined;
    }
    return c.json({ bytes, objects, freeBytes: R2_FREE_BYTES });
  });
