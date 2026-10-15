// Finance Vault: real money. Ledger, summary, sales and costs.
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { newApp, body, HttpError } from "../app";
import { ledger } from "../db/schema";
import { newId } from "../lib/crypto";
import { invalidateStats, nowIso, visible } from "../lib/store";
import { apiSpend, recordSale } from "../engine/queue";
import { recordEvent, checkAchievements, awardXp } from "../engine/game";
import { TRADING_ALLOWANCE_PENCE, ukTaxYear, XP } from "../../shared/game";
import type { FinanceSummary, LedgerEntry } from "../../shared/api";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}/, "Use YYYY-MM-DD")
  .transform((d) => (d.length === 10 ? `${d}T12:00:00.000Z` : d));

export const financeRoutes = newApp()
  .get("/ledger", async (c) => {
    const db = c.get("db");
    const rows = await db
      .select()
      .from(ledger)
      .where(visible(ledger.demo, c.get("settings").demoMode))
      .orderBy(desc(ledger.date))
      .limit(Math.min(2000, Number(c.req.query("limit") ?? 500) || 500))
      .all();
    return c.json({ entries: rows as LedgerEntry[] });
  })
  .get("/summary", async (c) => {
    const db = c.get("db");
    const settings = c.get("settings");
    const rows = await db.select().from(ledger).where(visible(ledger.demo, settings.demoMode)).all();
    const totals = { salesPence: 0, feesPence: 0, costsPence: 0, apiPence: 0, netPence: 0 };
    const byMonth = new Map<string, { month: string; salesPence: number; feesPence: number; costsPence: number; netPence: number }>();
    for (const r of rows) {
      const m = r.date.slice(0, 7);
      const bucket = byMonth.get(m) ?? { month: m, salesPence: 0, feesPence: 0, costsPence: 0, netPence: 0 };
      if (r.kind === "sale" || r.kind === "refund") {
        totals.salesPence += r.amountPence;
        bucket.salesPence += r.amountPence;
      } else if (r.kind === "fee") {
        totals.feesPence -= r.amountPence;
        bucket.feesPence -= r.amountPence;
      } else {
        if (r.kind === "api") totals.apiPence -= r.amountPence;
        totals.costsPence -= r.amountPence;
        bucket.costsPence -= r.amountPence;
      }
      totals.netPence += r.amountPence;
      bucket.netPence += r.amountPence;
      byMonth.set(m, bucket);
    }
    const ty = ukTaxYear(new Date());
    const grossPence = rows
      .filter((r) => (r.kind === "sale" || r.kind === "refund") && r.date >= ty.start && r.date < ty.end)
      .reduce((a, r) => a + r.amountPence, 0);
    const spend = await apiSpend(db, settings.demoMode);
    const summary: FinanceSummary = {
      totals,
      monthly: [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-12),
      spend: { ...spend, dailyCapPence: settings.dailyCapPence, monthlyCapPence: settings.monthlyCapPence },
      taxYear: { label: ty.label, grossPence, allowancePence: TRADING_ALLOWANCE_PENCE },
    };
    return c.json(summary);
  })
  .post("/sales", async (c) => {
    const b = await body(
      c,
      z.object({
        pricePence: z.number().int().min(1).max(10_000_00),
        description: z.string().min(1).max(200),
        date: dateSchema.optional(),
        nonGbp: z.boolean().optional(),
        offsiteAds: z.boolean().optional(),
      }),
    );
    const db = c.get("db");
    const settings = c.get("settings");
    // Sales you type in are real money, even in demo mode.
    const res = await recordSale(db, settings, { ...b, date: b.date ?? nowIso(), demo: false });
    await awardXp(db, XP.recordRealSale, "Recorded a real sale", false, settings.demoMode);
    await recordEvent(db, "ledger_entry", false);
    return c.json({ ok: true, ...res });
  })
  .post("/entries", async (c) => {
    const b = await body(
      c,
      z.object({
        kind: z.enum(["cost", "api", "refund"]),
        category: z.string().min(1).max(60),
        description: z.string().min(1).max(200),
        /** Positive number — stored negative. */
        amountPence: z.number().int().min(1).max(10_000_00),
        date: dateSchema.optional(),
      }),
    );
    const db = c.get("db");
    const id = newId("l_");
    await db.insert(ledger).values({
      id,
      date: b.date ?? nowIso(),
      kind: b.kind,
      category: b.category,
      description: b.description,
      amountPence: -b.amountPence,
      demo: false,
      createdAt: nowIso(),
    });
    await recordEvent(db, "ledger_entry", false);
    await recordEvent(db, "fee_calc", c.get("settings").demoMode);
    await checkAchievements(db, false, c.get("settings").demoMode);
    return c.json({ ok: true, id });
  })
  .delete("/entries/:id", async (c) => {
    const db = c.get("db");
    const id = c.req.param("id");
    const row = await db.select().from(ledger).where(eq(ledger.id, id)).get();
    if (!row) throw new HttpError(404, "Entry not found");
    // Deleting a sale also removes its fee line.
    await db.delete(ledger).where(eq(ledger.saleId, id));
    await db.delete(ledger).where(eq(ledger.id, id));
    await invalidateStats(db);
    return c.json({ ok: true });
  });
