// Phone notifications: turn on for this device, choose what pings you, send a test.
import { z } from "zod";
import { newApp, body, HttpError } from "../app";
import { addPushDevice, pushDevices, pushKeys, pushPrefs, PUSH_KINDS, removePushDevice, savePushPrefs, sendTestPush } from "../engine/push";

export const pushRoutes = newApp()
  .get("/push", async (c) => {
    const db = c.get("db");
    const keys = await pushKeys(db, c.env);
    const devices = await pushDevices(db);
    return c.json({
      ready: !!keys,
      publicKey: keys?.publicKey ?? null,
      kinds: PUSH_KINDS,
      prefs: await pushPrefs(db),
      devices: devices.map((d) => ({ id: d.id, label: d.label, endpoint: d.endpoint, createdAt: d.createdAt })),
    });
  })
  .post("/push/devices", async (c) => {
    const b = await body(
      c,
      z.object({
        endpoint: z.string().url().max(2000),
        keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }),
        label: z.string().max(60).optional(),
      }),
    );
    if (!new URL(b.endpoint).protocol.startsWith("https")) throw new HttpError(400, "That isn't a push address.");
    const d = await addPushDevice(c.get("db"), { endpoint: b.endpoint, p256dh: b.keys.p256dh, auth: b.keys.auth }, b.label ?? "Phone", new URL(c.req.url).origin);
    return c.json({ ok: true, id: d.id });
  })
  .delete("/push/devices/:id", async (c) => {
    await removePushDevice(c.get("db"), { id: c.req.param("id") });
    return c.json({ ok: true });
  })
  .put("/push/prefs", async (c) => {
    const b = await body(c, z.object({ sales: z.boolean(), approvals: z.boolean(), reviews: z.boolean(), renewals: z.boolean(), reports: z.boolean() }).partial());
    const prefs = { ...(await pushPrefs(c.get("db"))), ...b };
    await savePushPrefs(c.get("db"), prefs);
    return c.json({ ok: true, prefs });
  })
  .post("/push/test", async (c) => {
    try {
      return c.json({ results: await sendTestPush(c.get("db"), c.env) });
    } catch (e) {
      throw new HttpError(503, e instanceof Error ? e.message : "Couldn't send a test.");
    }
  });
