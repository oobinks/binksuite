// Strategy: the shop's numbers (no AI) and Manager's weekly report.
import { newApp, aiFor, HttpError } from "../app";
import { isAiLimit } from "../providers/ai";
import { isClaudePending } from "../providers/claudeCode";
import { collectPending, listReports, pendingReport, shopNumbers, writeReport } from "../engine/strategy";
import { listingPerformance } from "../engine/performance";

export const strategyRoutes = newApp()
  // How each Etsy listing is doing. "Check Etsy now" is POST /live/check.
  .get("/strategy/performance", async (c) => c.json({ listings: await listingPerformance(c.get("db")) }))
  .get("/strategy/numbers", async (c) => {
    return c.json(await shopNumbers(c.get("db"), c.get("settings").demoMode));
  })
  .get("/strategy/reports", async (c) => {
    const db = c.get("db");
    const ai = aiFor(c);
    // A report waiting on Claude: pick up the answer if it's in.
    await collectPending(db, ai).catch(() => null);
    const waiting = await pendingReport(db);
    return c.json({ reports: await listReports(db), pending: !!waiting, aiOn: !!ai });
  })
  .post("/strategy/report", async (c) => {
    // "Write this week's report now" (rewrites this week's if there is one).
    const ai = aiFor(c);
    if (!ai) throw new HttpError(400, "Switch on real AI in Settings first.");
    try {
      return c.json({ ok: true, report: await writeReport(c.get("db"), c.get("settings"), ai) });
    } catch (e) {
      if (isClaudePending(e)) return c.json({ ok: true, pending: true, report: null }, 202);
      throw new HttpError(isAiLimit(e) ? 429 : 502, e instanceof Error ? e.message : "Manager couldn't write the report just now.");
    }
  });
