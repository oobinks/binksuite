// Seeds a believable demo shop: some live products with a sales history,
// a few products part-way through the pipeline, and enough XP to sit at Lv3.
import { eq } from "drizzle-orm";
import type { DB } from "../src/worker/db";
import { schema } from "../src/worker/db";
import { calculateFees } from "../src/shared/fees";
import { mulberry32, intBetween } from "../src/shared/rng";
import type { Settings } from "../src/shared/settings";
import { newId } from "../src/worker/lib/crypto";
import { nowIso, kvSet } from "../src/worker/lib/store";
import { DEMO_NICHES } from "../src/worker/engine/agents/demoContent";
import { STEP_BY_KIND } from "../src/worker/engine/agents";
import { createTask, logActivity } from "../src/worker/engine/queue";
import type { ProductRow } from "../src/worker/engine/agents/types";

const { products, ledger, xpLog, tasks, activity, handoffs, events, questClaims, achievements, notifications, approvals } = schema;

const DAY = 86_400_000;

export async function clearDemoData(db: DB) {
  for (const t of [products, ledger, xpLog, tasks, activity, handoffs, events, questClaims, achievements, notifications, approvals]) {
    await db.delete(t).where(eq(t.demo, true));
  }
  await kvSet(db, "demoClock", { lastSpawn: 0, lastSale: Date.now() });
}

export async function seedDemo(db: DB, settings: Settings, now = new Date()) {
  await clearDemoData(db);
  const rng = mulberry32(20261015);
  const iso = (msAgo: number) => nowIso(new Date(now.getTime() - msAgo));

  // Five live products with ~60 days of sales. History goes in the ledger only —
  // quests and achievements count what *you* do from here on. Rows are collected and inserted in
  // chunks (D1 allows 100 bound parameters per statement).
  const liveNiches = DEMO_NICHES.slice(0, 5);
  const prices = [449, 399, 549, 349, 299];
  const productRows: (typeof products.$inferInsert)[] = [];
  const ledgerRows: (typeof ledger.$inferInsert)[] = [];
  for (let i = 0; i < liveNiches.length; i++) {
    const n = liveNiches[i];
    const id = newId("p_");
    const created = iso((70 - i * 8) * DAY);
    productRows.push({
      id,
      title: n.product,
      niche: n.niche,
      stage: "live",
      seed: 1000 + i * 37,
      pricePence: prices[i],
      data: { niche: n.niche, palette: n.palette },
      demo: true,
      createdAt: created,
      updatedAt: created,
    });
    const sales = intBetween(rng, 3, 9);
    for (let s = 0; s < sales; s++) {
      const date = iso(intBetween(rng, 0, 60 - i * 6) * DAY + intBetween(rng, 0, DAY - 1));
      const nonGbp = rng() < 0.25;
      const fees = calculateFees({ pricePence: prices[i], nonGbp }, settings.fees);
      const saleId = newId("l_");
      ledgerRows.push(
        { id: saleId, date, kind: "sale", category: "Etsy sale", description: n.product, amountPence: fees.grossPence, nonGbp, productId: id, demo: true, createdAt: date },
        { id: newId("l_"), date, kind: "fee", category: "Etsy fees (inc. VAT)", description: `Fees on: ${n.product}`, amountPence: -fees.totalFeesPence, productId: id, saleId, demo: true, createdAt: date },
      );
    }
    ledgerRows.push({
      id: newId("l_"),
      date: created,
      kind: "api",
      category: "Demo AI",
      description: `Research + art for ${n.product}`,
      amountPence: -intBetween(rng, 8, 20),
      productId: id,
      demo: true,
      createdAt: created,
    });
  }
  ledgerRows.push({
    id: newId("l_"),
    date: iso(20 * DAY),
    kind: "cost",
    category: "Software",
    description: "Font licence (demo)",
    amountPence: -500,
    demo: true,
    createdAt: iso(20 * DAY),
  });
  const chunks = <T,>(rows: T[], size: number) => Array.from({ length: Math.ceil(rows.length / size) }, (_, i) => rows.slice(i * size, i * size + size));
  const inserts = [
    ...chunks(productRows, 8).map((r) => db.insert(products).values(r)),
    ...chunks(ledgerRows, 8).map((r) => db.insert(ledger).values(r)),
  ];
  await db.batch(inserts as [ (typeof inserts)[number], ...(typeof inserts)[number][] ]);

  // XP: sits at Lv3 (250) with 100 to go to Lv4 (500), where the Launch Pad unlocks.
  await db.insert(xpLog).values({ amount: 400, reason: "Demo shop history", demo: true, createdAt: iso(1 * DAY) });

  // Three products mid-pipeline so every early room has something going on.
  const inFlight: { niche: (typeof DEMO_NICHES)[number]; kind: string; state: "needs_approval" | "working" | "queued" }[] = [
    { niche: DEMO_NICHES[5], kind: "niche_score", state: "needs_approval" },
    { niche: DEMO_NICHES[6], kind: "images", state: "working" },
    { niche: DEMO_NICHES[7], kind: "price", state: "queued" },
  ];
  for (let i = 0; i < inFlight.length; i++) {
    const f = inFlight[i];
    const p: ProductRow = {
      id: newId("p_"),
      title: i === 0 ? f.niche.niche : f.niche.product,
      niche: f.niche.niche,
      stage: STEP_BY_KIND[f.kind].room,
      seed: 2000 + i * 53,
      pricePence: null,
      data: { niche: f.niche.niche, palette: f.niche.palette, audience: f.niche.audience, keywords: f.niche.keywords },
      demo: true,
      createdAt: iso((3 - i) * 3600_000),
      updatedAt: iso(0),
    };
    if (f.kind === "price") {
      // Pretend the Copywriter already finished this one.
      const copy = await STEP_BY_KIND.copy.run({ task: { input: {} } as never, product: p, settings, rng });
      p.data = { ...p.data, ...copy.productData, files: ["demo.pdf"], zip: "demo.zip" };
    }
    await db.insert(products).values(p);
    const t = await createTask(db, p, f.kind, { demo: true });
    if (f.state !== "queued") {
      const step = STEP_BY_KIND[f.kind];
      const startedAt = iso(f.state === "working" ? 4_000 : 60_000);
      const patch: Partial<typeof tasks.$inferInsert> = { state: "working", startedAt, durationMs: 15_000, attempts: 1 };
      if (f.state === "needs_approval") {
        const res = await step.run({ task: t as never, product: p, settings, rng });
        Object.assign(patch, { state: "needs_approval", output: res.output, progress: 1, finishedAt: iso(30_000) });
        await db.insert(approvals).values({ id: newId("a_"), taskId: t.id, kind: step.approvalKind, summary: t.title, status: "pending", demo: true, createdAt: iso(30_000) });
      }
      await db.update(tasks).set(patch).where(eq(tasks.id, t.id));
    }
  }

  await logActivity(db, "scout", "research", "finish", "Scored “Moody cottagecore landscapes” — waiting for you", true);
  await logActivity(db, "designer", "studio", "start", "Started generating art for the meadow prints", true);
  await logActivity(db, "copywriter", "listing", "handoff", "📦 Listing words done — Pricer's turn", true);
  await kvSet(db, "demoClock", { lastSpawn: now.getTime(), lastSale: now.getTime() });
}

export async function isDemoSeeded(db: DB): Promise<boolean> {
  const row = await db.select({ id: products.id }).from(products).where(eq(products.demo, true)).limit(1).get();
  return !!row;
}

