// 🎁 Bundles: put finished products together, then the usual pipeline takes over
// (build on your device → listing → price → compliance → launch).
import { and, eq, inArray } from "drizzle-orm";
import type { DB } from "../db";
import { products } from "../db/schema";
import { newId } from "../lib/crypto";
import { nowIso } from "../lib/store";
import { formatOf } from "../../shared/format";
import { BUNDLE_MAX, BUNDLE_MIN, bundleFormat, bundleIdeas, type BundleCandidate, type BundleItem, type BundleSpec } from "../../shared/bundle";
import type { SheetSpec } from "../../shared/sheetSpec";
import { cleanPhrase } from "../../shared/seo";
import { createTask, EngineError, logActivity } from "./queue";
import { includedBullets } from "./agents/real";
import type { ProductRow } from "./agents/types";

interface Finished {
  zipKey?: string;
  listing?: { tags: string[] };
  keptImages?: string[];
  sheet?: SheetSpec;
  bundle?: BundleSpec;
  dropped?: boolean;
}

/** A real product with its files, listing and price done, that isn't itself a bundle. */
function finished(p: ProductRow): p is ProductRow & { pricePence: number } {
  const d = p.data as Finished;
  return !p.demo && !!d.zipKey && !!d.listing && !!p.pricePence && !d.bundle && !d.dropped && p.stage !== "dropped";
}

function candidate(p: ProductRow & { pricePence: number }): BundleCandidate {
  const d = p.data as Finished;
  return { id: p.id, title: p.title, format: formatOf(p), pricePence: p.pricePence, tags: d.listing?.tags ?? [], cover: d.keptImages?.[0] ?? null, live: p.stage === "live" };
}

export async function bundleCandidates(db: DB) {
  const rows = await db.select().from(products).where(eq(products.demo, false)).all();
  const list = rows.filter(finished).map(candidate);
  return { candidates: list, ideas: bundleIdeas(list) };
}

export async function createBundle(db: DB, input: { name: string; ids: string[]; savePercent: number; theme?: string }): Promise<ProductRow> {
  const ids = [...new Set(input.ids)];
  if (ids.length < BUNDLE_MIN || ids.length > BUNDLE_MAX) throw new EngineError(`Pick ${BUNDLE_MIN} to ${BUNDLE_MAX} products.`);
  const rows = await db.select().from(products).where(and(inArray(products.id, ids), eq(products.demo, false))).all();
  const ready = ids.map((id) => rows.find((r) => r.id === id)).filter((r): r is ProductRow & { pricePence: number } => !!r && finished(r));
  if (ready.length !== ids.length) throw new EngineError("Every product in a bundle needs its files, listing and price finished first.");
  const items: BundleItem[] = ready.map((p) => {
    const d = p.data as Finished;
    const format = formatOf(p);
    return { id: p.id, title: p.title, format, pricePence: p.pricePence, zipKey: d.zipKey!, cover: d.keptImages?.[0] ?? null, included: includedBullets(format, d.sheet, d.keptImages?.length ?? 0)[0] };
  });
  const name = input.name.trim().replace(/\s+/g, " ").slice(0, 80);
  if (name.length < 3) throw new EngineError("Give the bundle a name.");
  const theme = cleanPhrase(input.theme || name.replace(/^the\s+|\s+bundle$/gi, "")).slice(0, 40) || "bundle";
  const bundle: BundleSpec = { items, savePercent: Math.max(5, Math.min(70, Math.round(input.savePercent))), theme };
  const now = nowIso();
  const product: ProductRow = {
    id: newId("p_"),
    title: name,
    niche: `${theme} bundle`,
    stage: "studio",
    seed: Math.floor(Math.random() * 1e6),
    pricePence: null,
    data: { format: bundleFormat(items), bundle },
    demo: false,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(products).values(product);
  await createTask(db, product, "bundle_build", { demo: false });
  await logActivity(db, "printer", "studio", "new", `🎁 New bundle: “${name}” (${items.length} products)`, false);
  return product;
}
