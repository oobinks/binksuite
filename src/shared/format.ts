// What kind of product something is: 🎨 ART (wall art prints), 📊 EXCEL (a ready-made
// spreadsheet, plus a printable PDF copy) or 📄 PDF (a printable planner, tracker or checklist).

export const FORMATS = ["art", "excel", "pdf"] as const;
export type ProductFormat = (typeof FORMATS)[number];

export const FORMAT_INFO: Record<ProductFormat, { icon: string; label: string; long: string; chip: string }> = {
  art: { icon: "🎨", label: "ART", long: "Wall art print", chip: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200" },
  excel: { icon: "📊", label: "EXCEL", long: "Excel spreadsheet + printable PDF", chip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200" },
  pdf: { icon: "📄", label: "PDF", long: "Printable planner / tracker PDF", chip: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200" },
};

const EXCEL_WORDS = /\b(spreadsheets?|excel|google sheets?|xlsx|budget|expenses?|finances?|savings|debt|bills?|calculator|sinking funds?|bookkeeping|profit|income)\b/i;
const PDF_WORDS = /\b(planners?|trackers?|checklists?|journals?|logs?|schedules?|worksheets?|lists?|charts?|calendars?|organi[sz]ers?|itinerary|labels?|games?|colouring|coloring)\b/i;

/** Best guess from the idea's wording. Money and "spreadsheet" words → Excel; planner-ish words → PDF; otherwise art. */
export function guessFormat(text: string): ProductFormat {
  if (EXCEL_WORDS.test(text)) return "excel";
  if (PDF_WORDS.test(text)) return "pdf";
  return "art";
}

export function isFormat(x: unknown): x is ProductFormat {
  return typeof x === "string" && (FORMATS as readonly string[]).includes(x);
}

/** A product's format: what was chosen, else a guess from its idea. Demo products are always art. */
export function formatOf(p: { demo?: boolean; niche?: string; title?: string; data?: unknown }): ProductFormat {
  if (p.demo) return "art";
  const d = (p.data ?? {}) as { format?: unknown; suggestion?: { idea?: string } };
  if (isFormat(d.format)) return d.format;
  return guessFormat(d.suggestion?.idea ?? p.niche ?? p.title ?? "");
}

/** Sheet-type products (Excel and PDF) are designed as tables rather than painted. */
export const isSheetFormat = (f: ProductFormat) => f === "excel" || f === "pdf";
