// Each product's design style (see shared/designStyles.ts): picked once, the first time
// its files are built, so it isn't the same as the last few products. Then it stays put,
// so rebuilding gives the same look unless you choose another.
import { and, desc, eq, ne, sql } from "drizzle-orm";
import type { DB } from "../db";
import { products } from "../db/schema";
import { nowIso } from "../lib/store";
import { isStyleId, pickStyle, STYLE_IDS, type StyleId } from "../../shared/designStyles";

export async function designStyleFor(db: DB, productId: string): Promise<StyleId | null> {
  const p = await db.select().from(products).where(eq(products.id, productId)).get();
  if (!p) return null;
  const d = p.data as { designStyle?: unknown };
  if (isStyleId(d.designStyle)) return d.designStyle;
  const recent = await db
    .select({ style: sql<string | null>`json_extract(${products.data}, '$.designStyle')` })
    .from(products)
    .where(and(ne(products.id, p.id), eq(products.demo, p.demo), sql`json_extract(${products.data}, '$.designStyle') IS NOT NULL`))
    .orderBy(desc(products.updatedAt))
    .limit(STYLE_IDS.length - 1)
    .all();
  const style = pickStyle(p.seed || p.id, recent.map((r) => r.style as StyleId));
  await setDesignStyle(db, p.id, style);
  return style;
}

export async function setDesignStyle(db: DB, productId: string, style: StyleId) {
  const p = await db.select().from(products).where(eq(products.id, productId)).get();
  if (!p) return false;
  await db
    .update(products)
    .set({ data: { ...p.data, designStyle: style }, updatedAt: nowIso() })
    .where(eq(products.id, p.id));
  return true;
}
