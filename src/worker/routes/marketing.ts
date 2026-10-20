// Marketing room: Promoter's Pinterest pins and weekly content calendar. Drafts only.
import { z } from "zod";
import { newApp, body, HttpError, aiFor, type Ctx } from "../app";
import { isAiLimit } from "../providers/ai";
import { isClaudePending } from "../providers/claudeCode";
import {
  getCalendar,
  markCalendarPending,
  markPinsPending,
  planWeek,
  promotableProduct,
  promotableProducts,
  setPinned,
  tickDay,
  writePins,
} from "../engine/marketing";

function aiError(e: unknown): never {
  throw new HttpError(isAiLimit(e) ? 429 : 502, e instanceof Error ? e.message : "Promoter couldn't write that just now.");
}

/** Pick up answers Claude has finished since the last look (pins and calendar left "pending"). */
async function collectPending(c: Ctx) {
  const db = c.get("db");
  const ai = aiFor(c);
  if (!ai) return;
  const list = await promotableProducts(db);
  for (const p of list.filter((x) => x.pins.pendingRev != null)) {
    try {
      await writePins(db, ai, p, true);
    } catch {
      /* still waiting */
    }
  }
  const cal = await getCalendar(db);
  if (cal?.pendingRev != null && list.length) {
    try {
      await planWeek(db, ai, list, true);
    } catch {
      /* still waiting */
    }
  }
}

export const marketingRoutes = newApp()
  .get("/marketing", async (c) => {
    await collectPending(c);
    const db = c.get("db");
    return c.json({ aiReady: !!aiFor(c), products: await promotableProducts(db), calendar: await getCalendar(db) });
  })
  .post("/marketing/pins/:id", async (c) => {
    const b = await body(c, z.object({ rewrite: z.boolean().optional() }));
    const db = c.get("db");
    const p = await promotableProduct(db, c.req.param("id"));
    if (!p) throw new HttpError(404, "That product needs a listing and listing photos first.");
    try {
      return c.json({ ok: true, copy: await writePins(db, aiFor(c), p, !!b.rewrite) });
    } catch (e) {
      if (isClaudePending(e)) {
        await markPinsPending(db, p, !!b.rewrite);
        return c.json({ ok: true, pending: true, copy: p.pins.copy }, 202);
      }
      aiError(e);
    }
  })
  .post("/marketing/pins/:id/pinned", async (c) => {
    const b = await body(c, z.object({ pinned: z.boolean() }));
    const db = c.get("db");
    const p = await promotableProduct(db, c.req.param("id"));
    if (!p) throw new HttpError(404, "No such product");
    return c.json({ ok: true, pins: await setPinned(db, p.id, b.pinned) });
  })
  .post("/marketing/calendar", async (c) => {
    const b = await body(c, z.object({ replan: z.boolean().optional() }));
    const db = c.get("db");
    const list = await promotableProducts(db);
    if (!list.length) throw new HttpError(400, "Add a product with a listing and photos first. Then Promoter can plan posts for it.");
    try {
      return c.json({ ok: true, calendar: await planWeek(db, aiFor(c), list, !!b.replan) });
    } catch (e) {
      if (isClaudePending(e)) {
        await markCalendarPending(db, !!b.replan);
        return c.json({ ok: true, pending: true, calendar: await getCalendar(db) }, 202);
      }
      aiError(e);
    }
  })
  .post("/marketing/calendar/done", async (c) => {
    const b = await body(c, z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), done: z.boolean() }));
    const cal = await tickDay(c.get("db"), b.date, b.done);
    if (!cal) throw new HttpError(404, "That day isn't in the plan.");
    return c.json({ ok: true, calendar: cal });
  });
