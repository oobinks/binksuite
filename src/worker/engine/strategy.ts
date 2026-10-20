// Strategy: Manager's weekly look at the shop. First the plain facts (sales, fees,
// costs, best sellers, the pipeline, listings about to expire), worked out from the
// ledger and products with no AI. Then, once a week, Manager writes a short, honest
// report from those facts only, with a few next steps that link to the right room.
import { and, gte } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "../db";
import { ledger, products } from "../db/schema";
import type { Settings } from "../../shared/settings";
import { FORMATS, formatOf, type ProductFormat } from "../../shared/format";
import { ROOMS, type RoomId } from "../../shared/registry";
import { kvGet, kvSet, nowIso, visible } from "../lib/store";
import { isAiLimit, type AiServices } from "../providers/ai";
import { isClaudePending } from "../providers/claudeCode";
import { SHOP_CONTEXT } from "./agents/real";
import { logActivity } from "./queue";
import { queuePush } from "./push";

const DAY = 86_400_000;
export const REPORTS_KEY = "strategyReports";
const PENDING_KEY = "strategyPending";
const WEEKLY_KEY = "strategyWeekly";
const KEEP_REPORTS = 12;
/** Monday from this hour (UTC) the weekly report is written. */
export const REPORT_HOUR_UTC = 7;
const EXPIRY_WINDOW_DAYS = 14;

// ───────────── The numbers ─────────────

export type FormatKey = ProductFormat | "unlinked";

export interface PeriodNumbers {
  from: string;
  to: string;
  days: number;
  sales: number;
  revenuePence: number;
  feesPence: number;
  costsPence: number;
  aiSpendPence: number;
  netPence: number;
  bestSellers: { productId: string | null; title: string; format: FormatKey; sales: number; revenuePence: number }[];
  byFormat: { format: FormatKey; sales: number; revenuePence: number; share: number }[];
  pipeline: { started: number; drafted: number; live: number; dropped: number };
}

export interface ShopNumbers {
  at: string;
  demoMode: boolean;
  week: PeriodNumbers;
  prevWeek: PeriodNumbers;
  month: PeriodNumbers;
  liveListings: number;
  /** Live Etsy listings ending within 14 days (from the renewal checks). */
  expiringSoon: { productId: string; title: string; endsAt: string; daysLeft: number }[];
  /** Net profit per week (Monday start), oldest first, current week last. */
  weekly: { weekStart: string; week: string; netPence: number; revenuePence: number; sales: number }[];
}

/** ISO week label, e.g. 2026-W43. */
export function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / DAY + 1) / 7);
  return `${y}-W${String(w).padStart(2, "0")}`;
}

/** 00:00 UTC on the Monday of d's week. */
export function mondayOf(d: Date): Date {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
  return t;
}

type LedgerRow = typeof ledger.$inferSelect;
type ProductRow = typeof products.$inferSelect;

interface PData {
  etsy?: { listingId: number; at?: string };
  etsyLive?: { state: string; endsAt: string | null };
  launchedAt?: string;
  dropped?: boolean;
  bundle?: unknown;
}

const inRange = (iso: string | null | undefined, from: string, to: string) => !!iso && iso >= from && iso < to;

function period(rows: LedgerRow[], prods: ProductRow[], byId: Map<string, ProductRow>, fromD: Date, toD: Date): PeriodNumbers {
  const from = fromD.toISOString();
  const to = toD.toISOString();
  const p: PeriodNumbers = {
    from,
    to,
    days: Math.round((toD.getTime() - fromD.getTime()) / DAY),
    sales: 0,
    revenuePence: 0,
    feesPence: 0,
    costsPence: 0,
    aiSpendPence: 0,
    netPence: 0,
    bestSellers: [],
    byFormat: [],
    pipeline: { started: 0, drafted: 0, live: 0, dropped: 0 },
  };
  const sellers = new Map<string, PeriodNumbers["bestSellers"][number]>();
  const formats = new Map<FormatKey, { sales: number; revenuePence: number }>();
  for (const r of rows) {
    if (!inRange(r.date, from, to)) continue;
    p.netPence += r.amountPence;
    if (r.kind === "sale" || r.kind === "refund") {
      p.revenuePence += r.amountPence;
      const prod = r.productId ? byId.get(r.productId) : undefined;
      const format: FormatKey = prod ? formatOf(prod) : "unlinked";
      const key = prod?.id ?? `d:${r.description}`;
      const s = sellers.get(key) ?? { productId: prod?.id ?? null, title: prod?.title ?? r.description, format, sales: 0, revenuePence: 0 };
      const f = formats.get(format) ?? { sales: 0, revenuePence: 0 };
      if (r.kind === "sale") {
        p.sales++;
        s.sales++;
        f.sales++;
      }
      s.revenuePence += r.amountPence;
      f.revenuePence += r.amountPence;
      sellers.set(key, s);
      formats.set(format, f);
    } else if (r.kind === "fee") p.feesPence -= r.amountPence;
    else if (r.kind === "api") p.aiSpendPence -= r.amountPence;
    else p.costsPence -= r.amountPence;
  }
  p.bestSellers = [...sellers.values()].sort((a, b) => b.revenuePence - a.revenuePence || b.sales - a.sales).slice(0, 5);
  const total = Math.max(0, p.revenuePence);
  p.byFormat = [...FORMATS, "unlinked" as const]
    .map((format) => {
      const f = formats.get(format) ?? { sales: 0, revenuePence: 0 };
      return { format, ...f, share: total > 0 ? Math.round((Math.max(0, f.revenuePence) / total) * 100) : 0 };
    })
    .filter((f) => f.format !== "unlinked" || f.sales > 0 || f.revenuePence !== 0);
  for (const prod of prods) {
    const d = (prod.data ?? {}) as PData;
    if (inRange(prod.createdAt, from, to)) p.pipeline.started++;
    if (inRange(d.etsy?.at, from, to)) p.pipeline.drafted++;
    const liveAt = d.launchedAt ?? (prod.stage === "live" ? prod.updatedAt : null);
    if (inRange(liveAt, from, to)) p.pipeline.live++;
    if ((prod.stage === "dropped" || d.dropped) && inRange(prod.updatedAt, from, to)) p.pipeline.dropped++;
  }
  return p;
}

/** The plain facts for the last 7 days, the 7 before, and the last 4 weeks. Same demo rules as Finance. */
export async function shopNumbers(db: DB, demoMode: boolean, now = new Date()): Promise<ShopNumbers> {
  const firstMonday = new Date(mondayOf(now).getTime() - 7 * 7 * DAY);
  const earliest = new Date(Math.min(firstMonday.getTime(), now.getTime() - 28 * DAY));
  const [rows, prods] = await Promise.all([
    db
      .select()
      .from(ledger)
      .where(and(gte(ledger.date, earliest.toISOString()), visible(ledger.demo, demoMode)))
      .all(),
    db.select().from(products).where(visible(products.demo, demoMode)).all(),
  ]);
  const byId = new Map(prods.map((p) => [p.id, p]));
  const ago = (days: number) => new Date(now.getTime() - days * DAY);
  const weekly: ShopNumbers["weekly"] = [];
  for (let i = 0; i < 8; i++) {
    const start = new Date(firstMonday.getTime() + i * 7 * DAY);
    const end = new Date(start.getTime() + 7 * DAY);
    const from = start.toISOString();
    const to = end.toISOString();
    let netPence = 0;
    let revenuePence = 0;
    let sales = 0;
    for (const r of rows) {
      if (!inRange(r.date, from, to)) continue;
      netPence += r.amountPence;
      if (r.kind === "sale" || r.kind === "refund") revenuePence += r.amountPence;
      if (r.kind === "sale") sales++;
    }
    weekly.push({ weekStart: from.slice(0, 10), week: isoWeek(start), netPence, revenuePence, sales });
  }
  const expiringSoon: ShopNumbers["expiringSoon"] = [];
  for (const p of prods) {
    const live = ((p.data ?? {}) as PData).etsyLive;
    if (live?.state !== "active" || !live.endsAt) continue;
    const ms = new Date(live.endsAt).getTime() - now.getTime();
    if (ms < 0 || ms > EXPIRY_WINDOW_DAYS * DAY) continue;
    expiringSoon.push({ productId: p.id, title: p.title, endsAt: live.endsAt, daysLeft: Math.ceil(ms / DAY) });
  }
  expiringSoon.sort((a, b) => a.endsAt.localeCompare(b.endsAt));
  return {
    at: nowIso(now),
    demoMode,
    week: period(rows, prods, byId, ago(7), now),
    prevWeek: period(rows, prods, byId, ago(14), ago(7)),
    month: period(rows, prods, byId, ago(28), now),
    liveListings: prods.filter((p) => p.stage === "live").length,
    expiringSoon,
    weekly,
  };
}

// ───────────── Manager's report ─────────────

export interface NextStep {
  text: string;
  room: RoomId | null;
}

export interface StrategyReport {
  id: string;
  week: string;
  at: string;
  headline: string;
  wentWell: string[];
  didnt: string[];
  nextSteps: NextStep[];
  /** How many times this week's report has been rewritten. */
  redo: number;
  auto: boolean;
  numbers: ShopNumbers;
}

interface Pending {
  week: string;
  redo: number;
  auto: boolean;
  numbers: ShopNumbers;
  at: string;
}

const ROOM_IDS = ROOMS.map((r) => r.id) as RoomId[];

const reportSchema = z.object({
  headline: z.string().min(1),
  wentWell: z.array(z.string()).default([]),
  didnt: z.array(z.string()).default([]),
  nextSteps: z.array(z.object({ text: z.string().min(1), room: z.string().nullable().optional() })).min(1),
});

const reportJsonSchema = {
  type: "object",
  properties: {
    headline: { type: "string" },
    wentWell: { type: "array", items: { type: "string" } },
    didnt: { type: "array", items: { type: "string" } },
    nextSteps: {
      type: "array",
      items: { type: "object", properties: { text: { type: "string" }, room: { type: "string", enum: ROOM_IDS } }, required: ["text", "room"] },
    },
  },
  required: ["headline", "wentWell", "didnt", "nextSteps"],
};

const gbp = (p: number) => `${p < 0 ? "-" : ""}£${(Math.abs(p) / 100).toFixed(2)}`;
const FORMAT_WORD: Record<FormatKey, string> = { excel: "Excel spreadsheets", pdf: "printable PDFs", art: "wall art", unlinked: "sales not linked to a product" };

function periodFacts(label: string, p: PeriodNumbers): string {
  const lines = [
    `${label}:`,
    `- Sales: ${p.sales}; revenue ${gbp(p.revenuePence)}; Etsy fees ${gbp(p.feesPence)}; other costs ${gbp(p.costsPence)}; AI spend ${gbp(p.aiSpendPence)}; net profit ${gbp(p.netPence)}`,
    `- Pipeline: ${p.pipeline.started} products started, ${p.pipeline.drafted} sent to Etsy as drafts, ${p.pipeline.live} went live, ${p.pipeline.dropped} dropped`,
  ];
  if (p.sales || p.revenuePence) {
    lines.push(`- Sales by type: ${p.byFormat.map((f) => `${FORMAT_WORD[f.format]} ${f.sales} sales, ${gbp(f.revenuePence)} (${f.share}% of revenue)`).join("; ")}`);
    lines.push(`- Best sellers by revenue: ${p.bestSellers.map((b) => `"${b.title}" (${FORMAT_WORD[b.format]}): ${b.sales} sales, ${gbp(b.revenuePence)}`).join("; ")}`);
  }
  return lines.join("\n");
}

/** The facts, in words, exactly as the AI sees them. */
export function factsText(n: ShopNumbers): string {
  return [
    periodFacts("Last 7 days", n.week),
    periodFacts("The 7 days before that", n.prevWeek),
    periodFacts("Last 4 weeks", n.month),
    `Live listings now: ${n.liveListings}`,
    n.expiringSoon.length
      ? `Listings expiring on Etsy within ${EXPIRY_WINDOW_DAYS} days: ${n.expiringSoon.length} (${n.expiringSoon.map((e) => `"${e.title}" in ${e.daysLeft} days`).join("; ")})`
      : `Listings expiring on Etsy within ${EXPIRY_WINDOW_DAYS} days: none known`,
    `Net profit per week, oldest first: ${n.weekly.map((w) => `w/c ${w.weekStart} ${gbp(w.netPence)}`).join("; ")}`,
  ].join("\n");
}

const ROOM_GUIDE =
  "Rooms for next steps: research (find and pick product ideas), studio (make the product), mockups (product photos), listing (titles, tags, descriptions), compliance (checks), launch (send drafts to Etsy, renew or retire expiring listings), orders (Etsy orders), finance (money), care (buyer messages and reviews), marketing (Pinterest and social posts), strategy (this report).";

/** Ask Manager for the report. Throws pending / limit errors for the caller to handle. */
async function askManager(ai: AiServices, pending: Pending): Promise<Omit<StrategyReport, "id" | "at" | "numbers" | "redo" | "auto" | "week">> {
  const n = pending.numbers;
  const quiet = n.month.sales === 0 && n.liveListings === 0;
  const r = await ai.json({
    key: `strategy:${pending.week}:r${pending.redo}`,
    label: `Weekly report (${pending.week})`,
    system: `${SHOP_CONTEXT} You are Manager, the shop's planner. Write a short, honest weekly report for the owner, who likes plain, simple words. Only use the numbers given to you: never invent, estimate or round them into new figures, and never quote percentages that are not given. If there is little or no data, say so plainly instead of pretending.`,
    prompt: `Here are this shop's facts (all money in GBP):\n${factsText(n)}\n\n${quiet ? "There are no sales and no live listings yet, so say so plainly and make getting the first products live the main next step.\n" : ""}Write: a one-sentence headline; up to 4 short points on what went well; up to 4 short points on what didn't; and 3 to 5 concrete next steps the owner can do this week, each starting with a verb and pointing at the room where it's done. ${ROOM_GUIDE} Keep every point under 160 characters. British spelling. No emoji.`,
    schema: reportSchema,
    jsonSchema: reportJsonSchema,
    maxTokens: 900,
  });
  const clean = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 240);
  return {
    headline: clean(r.headline),
    wentWell: r.wentWell.map(clean).filter(Boolean).slice(0, 5),
    didnt: r.didnt.map(clean).filter(Boolean).slice(0, 5),
    nextSteps: r.nextSteps.slice(0, 5).map((s) => ({ text: clean(s.text), room: ROOM_IDS.includes(s.room as RoomId) ? (s.room as RoomId) : null })),
  };
}

export const listReports = async (db: DB) => (await kvGet<StrategyReport[]>(db, REPORTS_KEY)) ?? [];
export const pendingReport = (db: DB) => kvGet<Pending>(db, PENDING_KEY);

async function finish(db: DB, ai: AiServices, pending: Pending): Promise<StrategyReport> {
  let body;
  try {
    body = await askManager(ai, pending);
  } catch (e) {
    // Only a request Claude is still working on stays waiting; anything else is dropped (try again with the button).
    if (!isClaudePending(e)) await kvSet(db, PENDING_KEY, null);
    throw e;
  }
  const report: StrategyReport = { id: `${pending.week}:r${pending.redo}`, week: pending.week, at: nowIso(), redo: pending.redo, auto: pending.auto, numbers: pending.numbers, ...body };
  const reports = (await listReports(db)).filter((r) => r.week !== pending.week);
  reports.unshift(report);
  reports.sort((a, b) => b.week.localeCompare(a.week));
  await kvSet(db, REPORTS_KEY, reports.slice(0, KEEP_REPORTS));
  await kvSet(db, PENDING_KEY, null);
  await logActivity(db, "manager", "strategy", "finish", `Weekly report ready: ${report.headline}`, false);
  if (report.auto) await queuePush(db, "reports", { title: "Your weekly report is ready", body: report.headline.slice(0, 160), url: "/room/strategy", tag: "report" });
  return report;
}

/**
 * Write (or rewrite) this week's report. If one is already waiting on Claude for this
 * week, that one is checked again instead of asking twice. Throws pending / limit errors.
 */
export async function writeReport(db: DB, settings: Settings, ai: AiServices, opts: { now?: Date; auto?: boolean } = {}): Promise<StrategyReport> {
  const now = opts.now ?? new Date();
  const week = isoWeek(now);
  const waiting = await pendingReport(db);
  if (waiting && waiting.week === week) return finish(db, ai, waiting);
  const existing = (await listReports(db)).find((r) => r.week === week);
  const pending: Pending = { week, redo: existing ? existing.redo + 1 : 0, auto: !!opts.auto, numbers: await shopNumbers(db, settings.demoMode, now), at: nowIso(now) };
  await kvSet(db, PENDING_KEY, pending);
  return finish(db, ai, pending);
}

/** A report waiting on Claude: try to pick up the answer. Returns it when ready, quietly null otherwise. */
export async function collectPending(db: DB, ai: AiServices | null): Promise<StrategyReport | null> {
  const waiting = await pendingReport(db);
  if (!waiting || !ai) return null;
  try {
    return await finish(db, ai, waiting);
  } catch (e) {
    if (isClaudePending(e) || isAiLimit(e)) return null;
    console.error("strategy report", e);
    return null;
  }
}

/** Cron: every Monday from 07:00 UTC, once per ISO week, write the report (real AI only). */
export async function strategyTick(db: DB, settings: Settings, ai: AiServices | null, now = new Date()): Promise<"written" | "pending" | "skipped"> {
  if (!ai) return "skipped";
  const week = isoWeek(now);
  const due = now.getTime() >= mondayOf(now).getTime() + REPORT_HOUR_UTC * 3600_000;
  const last = await kvGet<string>(db, WEEKLY_KEY);
  if (!due || last === week) {
    // Still pick up an answer Claude has finished since last time.
    return (await collectPending(db, ai)) ? "written" : "skipped";
  }
  await kvSet(db, WEEKLY_KEY, week);
  // You wrote one yourself this week already: nothing to do.
  if ((await listReports(db)).some((r) => r.week === week)) return "skipped";
  try {
    await writeReport(db, settings, ai, { now, auto: true });
    return "written";
  } catch (e) {
    if (isClaudePending(e)) return "pending";
    if (isAiLimit(e)) return "skipped";
    throw e;
  }
}
