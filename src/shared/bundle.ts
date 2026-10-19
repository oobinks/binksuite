// 🎁 Bundles: two or more of your finished products sold together for less than
// buying them one by one (like the best template shops' "complete bundles").
// The saving is always real: it's worked out from the prices the separate
// listings are actually on sale for, never from an invented "was" price.
import type { ProductFormat } from "./format";
import { cleanPhrase } from "./seo";

export const BUNDLE_MIN = 2;
export const BUNDLE_MAX = 8;
export const BUNDLE_SAVE_DEFAULT = 30;

/** A finished product as it goes into a bundle (snapshot taken when the bundle is made). */
export interface BundleItem {
  id: string;
  title: string;
  format: ProductFormat;
  /** What the product sells for on its own. */
  pricePence: number;
  zipKey: string;
  /** Its own first listing photo (or art), for the bundle's photos. */
  cover: string | null;
  /** One line on what's in it, for the description. */
  included: string;
}

export interface BundleSpec {
  items: BundleItem[];
  /** The discount you asked for, vs buying them separately. */
  savePercent: number;
  /** What it should rank for, e.g. "budget". */
  theme: string;
}

/** A product you could put in a bundle. */
export interface BundleCandidate {
  id: string;
  title: string;
  format: ProductFormat;
  pricePence: number;
  tags: string[];
  cover: string | null;
  live: boolean;
}

export interface BundleIdea {
  name: string;
  theme: string;
  ids: string[];
  why: string;
}

/** Words that say what a product is made as, not what it's about. */
const GENERIC = new Set(
  "a an and the for of to in on with your my or by printable digital download instant template templates editable spreadsheet spreadsheets excel google sheet sheets xlsx pdf planner planners tracker trackers wall art print prints poster posters decor home gift gifts idea ideas set bundle simple easy cute minimalist modern a4 a5 us letter page pages kit".split(" "),
);

function themeWords(c: BundleCandidate): Set<string> {
  const words = new Set<string>();
  for (const t of [...c.tags, c.title]) for (const w of cleanPhrase(t).split(" ")) if (w.length > 2 && !GENERIC.has(w) && !/^\d+$/.test(w)) words.add(w);
  return words;
}

const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

/** Products that share a theme (from their tags and titles), biggest groups first. */
export function bundleIdeas(candidates: BundleCandidate[], max = 4): BundleIdea[] {
  const byWord = new Map<string, string[]>();
  for (const c of candidates) for (const w of themeWords(c)) byWord.set(w, [...(byWord.get(w) ?? []), c.id]);
  const ideas: BundleIdea[] = [];
  const seen = new Set<string>();
  const groups = [...byWord].filter(([, ids]) => ids.length >= BUNDLE_MIN).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  for (const [word, ids] of groups) {
    const pick = ids.slice(0, BUNDLE_MAX);
    const key = [...pick].sort().join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    ideas.push({ name: `The ${cap(word)} Bundle`, theme: word, ids: pick, why: `${pick.length} of your products are about “${word}”.` });
    if (ideas.length >= max) break;
  }
  return ideas;
}

/** What the bundle is made as: one format if they all match, else spreadsheets win, then PDFs. */
export function bundleFormat(items: { format: ProductFormat }[]): ProductFormat {
  const formats = new Set(items.map((i) => i.format));
  if (formats.size === 1) return items[0].format;
  return formats.has("excel") ? "excel" : formats.has("pdf") ? "pdf" : "art";
}

export const separatePrice = (items: { pricePence: number }[]) => items.reduce((a, i) => a + i.pricePence, 0);

/** Save this much (whole %) vs buying separately. */
export function savingPercent(separatePence: number, pricePence: number): number {
  return separatePence > 0 ? Math.floor(((separatePence - pricePence) / separatePence) * 100) : 0;
}

/** The phrase a bundle should rank for. */
export function bundleKeyword(spec: BundleSpec, format: ProductFormat): string {
  const kind = format === "excel" ? "spreadsheet bundle" : format === "pdf" ? "printable bundle" : "print set";
  return `${cleanPhrase(spec.theme)} ${kind}`.trim();
}
