// 🎨 Design styles. Each spreadsheet / printable product gets one, so the shop doesn't
// look like one template stamped out over and over. A style sets the fonts, the
// backdrop and props in the listing photos, the cover layout, the badges, and how
// titles and tables are drawn in the workbook and the PDF. The words and numbers
// never change: only how they're dressed.
//
// Fonts are all free for commercial use (SIL Open Font Licence, see public/fonts).
// Excel can't carry fonts inside the file, so the workbook uses common fonts that
// Excel, Google Sheets and Numbers all have.

export type StyleId = "classic" | "modern" | "editorial" | "bold" | "airy" | "timeless";

export interface DesignStyle {
  id: StyleId;
  name: string;
  blurb: string;
  /** Titles: the font file in public/fonts; all capitals or not, letter spacing, and size against the classic serif. */
  display: { file: string; upper: boolean; tracking: number; scale?: number };
  /** Everything else: regular and bold files (null = the classic Nunito / Lato pair). */
  body: { regular: string; bold: string } | null;
  /** Fonts in the .xlsx (must exist in Excel and Google Sheets). */
  excel: { title: string; body: string };
  /** Listing photo backdrop. */
  bg: "soft" | "grid" | "split" | "dots" | "lines" | "bold";
  /** Decoration in the listing photos. */
  prop: "plant" | "shapes" | "sprig" | "confetti";
  /** Cover photo layout: title on top, words down the left, a colour banner, or the title in a panel below the devices. */
  cover: "centre" | "left" | "banner" | "bottom";
  badge: "circle" | "square";
  /** The strip along the bottom of the cover. */
  bar: "white" | "accent";
  /** Corner roundness, 0 (square) to 1.4 (very round). */
  round: number;
  /** Title treatment on sheets and pages: a colour band, an underline, or a dark block. */
  header: "band" | "underline" | "block";
  /** Tables: banded rows, ruled lines only, or a boxed grid. */
  table: "banded" | "lined" | "boxed";
}

export const STYLES: Record<StyleId, DesignStyle> = {
  classic: {
    id: "classic",
    name: "Cosy classic",
    blurb: "Serif titles, soft cream backdrop, a plant",
    display: { file: "DMSerifDisplay-Regular.ttf", upper: false, tracking: 0 },
    body: null,
    excel: { title: "Georgia", body: "Calibri" },
    bg: "soft",
    prop: "plant",
    cover: "centre",
    badge: "circle",
    bar: "white",
    round: 1,
    header: "band",
    table: "banded",
  },
  modern: {
    id: "modern",
    name: "Fresh modern",
    blurb: "Geometric sans, graph-paper backdrop, shapes",
    display: { file: "SpaceGrotesk-Bold.ttf", upper: false, tracking: -1, scale: 0.9 },
    body: { regular: "SpaceGrotesk-Regular.ttf", bold: "SpaceGrotesk-Bold.ttf" },
    excel: { title: "Verdana", body: "Arial" },
    bg: "grid",
    prop: "shapes",
    cover: "left",
    badge: "square",
    bar: "accent",
    round: 0.45,
    header: "underline",
    table: "lined",
  },
  editorial: {
    id: "editorial",
    name: "Editorial",
    blurb: "Magazine serif, colour-block backdrop",
    display: { file: "PlayfairDisplay-Bold.ttf", upper: false, tracking: 0, scale: 0.95 },
    body: { regular: "Lora-Regular.ttf", bold: "Lora-Bold.ttf" },
    excel: { title: "Cambria", body: "Cambria" },
    bg: "split",
    prop: "sprig",
    cover: "bottom",
    badge: "circle",
    bar: "white",
    round: 0.3,
    header: "block",
    table: "boxed",
  },
  bold: {
    id: "bold",
    name: "Bold & bright",
    blurb: "Big poster capitals, confetti",
    display: { file: "BebasNeue-Regular.ttf", upper: true, tracking: 2, scale: 1.25 },
    body: { regular: "Poppins-Regular.ttf", bold: "Poppins-Bold.ttf" },
    excel: { title: "Impact", body: "Arial" },
    bg: "bold",
    prop: "confetti",
    cover: "left",
    badge: "square",
    bar: "accent",
    round: 0.7,
    header: "block",
    table: "banded",
  },
  airy: {
    id: "airy",
    name: "Soft & airy",
    blurb: "Spaced-out capitals, dotted backdrop",
    display: { file: "JosefinSans-Bold.ttf", upper: true, tracking: 6, scale: 0.74 },
    body: { regular: "JosefinSans-Regular.ttf", bold: "JosefinSans-Bold.ttf" },
    excel: { title: "Trebuchet MS", body: "Trebuchet MS" },
    bg: "dots",
    prop: "plant",
    cover: "centre",
    badge: "circle",
    bar: "white",
    round: 1.4,
    header: "underline",
    table: "lined",
  },
  timeless: {
    id: "timeless",
    name: "Timeless",
    blurb: "Book serif, notebook lines, a leafy sprig",
    display: { file: "LibreBaskerville-Bold.ttf", upper: false, tracking: 0, scale: 0.82 },
    body: { regular: "WorkSans-Regular.ttf", bold: "WorkSans-Bold.ttf" },
    excel: { title: "Times New Roman", body: "Verdana" },
    bg: "lines",
    prop: "sprig",
    cover: "banner",
    badge: "square",
    bar: "white",
    round: 0.6,
    header: "band",
    table: "boxed",
  },
};

export const STYLE_IDS = Object.keys(STYLES) as StyleId[];

export const isStyleId = (v: unknown): v is StyleId => typeof v === "string" && v in STYLES;

/** A steady pick from any id (the same product always gets the same style). */
export function autoStyle(key: string | number): StyleId {
  let h = 2166136261;
  for (const ch of String(key)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return STYLE_IDS[(h >>> 0) % STYLE_IDS.length];
}

/**
 * The style for a new product: its own steady pick, unless that matches one of the
 * last few products, in which case the next style nobody's used lately.
 */
export function pickStyle(key: string | number, recent: (StyleId | null | undefined)[] = []): StyleId {
  const avoid = new Set(recent.filter(isStyleId).slice(0, STYLE_IDS.length - 1));
  const start = STYLE_IDS.indexOf(autoStyle(key));
  for (let i = 0; i < STYLE_IDS.length; i++) {
    const id = STYLE_IDS[(start + i) % STYLE_IDS.length];
    if (!avoid.has(id)) return id;
  }
  return STYLE_IDS[start];
}

export const styleOf = (id: unknown): DesignStyle => STYLES[isStyleId(id) ? id : "classic"];
