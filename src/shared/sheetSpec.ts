// 📊 The design of a spreadsheet / printable tracker, as the Analyst writes it.
//
// The AI never writes raw Excel formulas. It uses a tiny, safe language that we
// check and translate here, so every formula in a file we sell actually works:
//
//   Column formulas (per row):   {Budget} - {Spent}        {Price} * {Qty}
//                                {input:Monthly take-home pay} - {Total}
//   Summary formulas:            SUM(Gifts[Spent])   COUNTIF(Gifts[Bought?], "Yes")
//                                SUMIF(Gifts[Who], "Mum", Gifts[Spent])
//                                {input:Christmas budget} - [Total spent]
//                                ([Bought] / [Gifts]) * 100
//
// Only numbers, + - * / ( ), column/input/summary references and
// SUM AVERAGE COUNT COUNTA MAX MIN COUNTIF SUMIF are allowed. Anything else is dropped.
//
// Bigger products are built from declared parts rather than free formulas:
//   • a tab can repeat for every month (Jan … Dec), and Tab[Column] then means all 12;
//   • "lists" live on a Settings tab the buyer can edit; dropdowns and the
//     dashboard read from them;
//   • "breakdowns" (a total per list item, with a doughnut or bar chart),
//     "trends" (month-by-month totals, with a bar or line chart) and "goals"
//     (progress towards a target) are laid out on the Dashboard by the app.

export const COLUMN_TYPES = ["text", "money", "number", "date", "percent", "checkbox", "choice"] as const;
export type ColumnType = (typeof COLUMN_TYPES)[number];
export const VALUE_TYPES = ["money", "number", "percent"] as const;
export type ValueType = (typeof VALUE_TYPES)[number];

export const CHART_KINDS = ["doughnut", "bar", "line", "none"] as const;
export type ChartKind = (typeof CHART_KINDS)[number];
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export interface SheetColumn {
  header: string;
  type: ColumnType;
  /** Dropdown options (type = choice). Checkbox columns get Yes / No. */
  options?: string[];
  /** Dropdown filled from a Settings list the buyer can edit (type = choice). */
  optionsFrom?: string;
  /** Per-row formula in the safe language; the column is then calculated, not typed. */
  formula?: string;
  /** Character width in Excel. */
  width: number;
}

export interface SheetTab {
  name: string;
  columns: SheetColumn[];
  /** A few filled-in rows so buyers see how it works (they delete or overwrite them). */
  exampleRows: (string | number | null)[][];
  /** Empty rows ready to fill in. */
  blankRows: number;
  /** Add a totals row under money / number columns. */
  totals: boolean;
  /** Repeat this tab for every month: 12 tabs named Jan … Dec. */
  repeat?: "months";
}

/** An editable list on the Settings tab (e.g. spending categories). */
export interface SheetList {
  name: string;
  items: string[];
}

/** A total per list item (e.g. spend per category), with an optional chart. */
export interface Breakdown {
  title: string;
  list: string;
  tab: string;
  /** The column holding the list item (a choice column using that list). */
  by: string;
  /** The money / number column to total. */
  sum: string;
  chart: ChartKind;
}

/** Month-by-month totals of one or more columns of a monthly tab, with an optional chart. */
export interface Trend {
  title: string;
  tab: string;
  series: string[];
  chart: ChartKind;
}

/** Progress towards a target: a summary line against an input. */
export interface Goal {
  label: string;
  current: string;
  target: string;
}

export interface SheetInput {
  label: string;
  type: ValueType;
  example: number;
}

export interface SummaryItem {
  label: string;
  formula: string;
  type: ValueType;
}

export interface SheetSpec {
  title: string;
  subtitle: string;
  currency: string;
  /** Header colour, #rrggbb. */
  accent: string;
  howTo: string[];
  inputs: SheetInput[];
  summary: SummaryItem[];
  tabs: SheetTab[];
  lists: SheetList[];
  breakdowns: Breakdown[];
  trends: Trend[];
  goals: Goal[];
  /** Words for the listing photos (written by the Analyst; worked out if missing). */
  marketing?: Marketing;
}

export interface Marketing {
  /** Feature line under the title, e.g. "Monthly Budget | Debt Tracker | Bill Calendar". */
  tagline: string;
  /** 2-4 round badges, e.g. "16 TABS", "AUTO DASHBOARD". */
  badges: string[];
  /** 4-6 short benefits, e.g. "Totals update as you type". */
  features: string[];
}

export const LIMITS = {
  tabs: 6,
  columns: 12,
  exampleRows: 10,
  blankRows: 150,
  inputs: 8,
  summary: 12,
  howTo: 8,
  lists: 6,
  listItems: 30,
  breakdowns: 4,
  trends: 3,
  series: 3,
  goals: 4,
} as const;
/** Empty slots under each Settings list, so buyers can add their own items. */
export const LIST_SPARE = 6;

const clean = (s: unknown, max = 60) =>
  String(s ?? "")
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

/** Excel sheet names: ≤ 31 chars, none of : \ / ? * [ ] */
export const safeTabName = (s: string) => clean(s, 31).replace(/[:\\/?*[\]']/g, "").trim() || "Sheet";

/** Column letter for a 0-based index (A, B, … Z, AA …). */
export function colLetter(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

// ───────────── Layout: where things sit in the workbook ─────────────
// Summary tab: title (row 1), subtitle (2), inputs from row 4, summary items after.
// Data tabs: title (row 1), header (row 3), data from row 4.

export const TAB_HEADER_ROW = 3;
export const TAB_FIRST_ROW = 4;
export const SUMMARY_FIRST_ROW = 4;
export const SUMMARY_TAB = "Dashboard";
export const SETTINGS_TAB = "Settings";
export const HOW_TO_TAB = "How to use";
/** Settings lists: names on row 4, items from row 5, one list every other column from B. */
export const LIST_HEADER_ROW = 4;

export function tabRowCount(t: SheetTab) {
  return t.exampleRows.length + t.blankRows;
}

/** Total number of tabs in the finished workbook. */
export function tabCount(spec: SheetSpec) {
  return dataSheets(spec).length + 1 + (hasDashboard(spec) ? 1 : 0) + (spec.lists.length ? 1 : 0);
}

/** The listing-photo words: the Analyst's, topped up with ones worked out from the design. */
/** Pages in the printable PDF: an overview page (when there's anything on it), then one per sheet. */
export function pageCount(spec: SheetSpec) {
  return dataSheets(spec).length + (spec.inputs.length || spec.summary.length || spec.howTo.length ? 1 : 0);
}

export function marketingFor(spec: SheetSpec, format: "art" | "excel" | "pdf" = "excel"): Marketing {
  const m = spec.marketing;
  if (format === "pdf") {
    const monthly = spec.tabs.some((t) => t.repeat === "months");
    const ticks = spec.tabs.some((t) => t.columns.some((c) => c.type === "checkbox"));
    return {
      tagline: m?.tagline || spec.subtitle.replace(/\s*·\s*/g, " | ") || spec.tabs.map((t) => t.name).slice(0, 3).join(" | "),
      badges: (m?.badges.length ? m.badges : [`${pageCount(spec)} PAGES`, monthly ? "12 MONTHS" : null, "A4 + LETTER", "PRINT AT HOME"].filter(Boolean) as string[]).slice(0, 4),
      features: (m?.features.length
        ? m.features
        : (["Print as many as you like", monthly ? "A page for every month" : null, ticks ? "Tick boxes to track progress" : null, "A4 and US Letter sizes", "Fill in by hand", "Instant download"].filter(Boolean) as string[])
      ).slice(0, 6),
    };
  }
  const charts = spec.breakdowns.filter((b) => b.chart !== "none").length + spec.trends.filter((t) => t.chart !== "none").length;
  const autoBadges = [
    `${tabCount(spec)} TABS`,
    hasDashboard(spec) ? "AUTO DASHBOARD" : null,
    spec.tabs.some((t) => t.repeat === "months") ? "12 MONTHS" : null,
    charts ? `${charts} CHART${charts === 1 ? "" : "S"}` : null,
    spec.lists.length ? "EDITABLE LISTS" : null,
  ].filter(Boolean) as string[];
  const autoFeatures = [
    "Totals update as you type",
    charts ? "Charts build themselves" : null,
    spec.lists.length ? `Edit your own ${spec.lists[0].name.toLowerCase()}` : null,
    spec.tabs.some((t) => t.repeat === "months") ? "A tab for every month" : null,
    spec.goals.length ? "Progress bars for your goals" : null,
    "Works in Excel and Google Sheets",
  ].filter(Boolean) as string[];
  return {
    tagline: m?.tagline || spec.subtitle.replace(/\s*·\s*/g, " | ") || spec.tabs.map((t) => t.name).slice(0, 3).join(" | "),
    badges: (m?.badges.length ? m.badges : autoBadges).slice(0, 4),
    features: (m?.features.length ? m.features : autoFeatures).slice(0, 6),
  };
}

/** Designs saved before lists, breakdowns, trends and goals existed: fill in the gaps. */
export function normaliseSpec(spec: SheetSpec): SheetSpec {
  return { ...spec, lists: spec.lists ?? [], breakdowns: spec.breakdowns ?? [], trends: spec.trends ?? [], goals: spec.goals ?? [] };
}

/** The real sheet names a tab becomes (a monthly tab becomes Jan … Dec). */
export function sheetNames(t: SheetTab): string[] {
  return t.repeat === "months" ? [...MONTHS] : [excelSheetName(t.name)];
}

/** Excel keeps the sheet name "History" for itself (any case), so a tab called that becomes "History Log". */
export function excelSheetName(name: string): string {
  return /^history$/i.test(name.trim()) ? `${name.trim()} Log` : name;
}

/** Every sheet the buyer fills in, in order. */
export function dataSheets(spec: SheetSpec): { name: string; tab: SheetTab; month: number | null }[] {
  return spec.tabs.flatMap((tab) => sheetNames(tab).map((name, i) => ({ name, tab, month: tab.repeat === "months" ? i : null })));
}

export function hasDashboard(spec: SheetSpec) {
  return spec.inputs.length + spec.summary.length + spec.breakdowns.length + spec.trends.length + spec.goals.length > 0;
}

/** Example rows for one month: the same examples with gently varied numbers, so every month (and the charts) look alive. */
const MONTH_FACTORS = [1, 0.92, 1.08, 0.97, 1.12, 0.9, 1.05, 1.1, 0.95, 1.02, 1.15, 1.25];
export function monthExampleRows(t: SheetTab, month: number | null): (string | number | null)[][] {
  if (month === null || month === 0) return t.exampleRows;
  const f = MONTH_FACTORS[month];
  return t.exampleRows.map((r) =>
    r.map((v, i) => {
      const c = t.columns[i];
      if (typeof v !== "number" || c.formula || !(c.type === "money" || c.type === "number")) return v;
      return c.type === "money" ? Math.round(v * f * 100) / 100 : Math.round(v * f);
    }),
  );
}

/** Where a Settings list lives: its column, and the cells for its items (including spare slots). */
export function listPlace(spec: SheetSpec, name: string) {
  const i = spec.lists.findIndex((l) => l.name.toLowerCase() === name.trim().toLowerCase());
  if (i < 0) return null;
  const L = colLetter(1 + i * 2);
  const slots = spec.lists[i].items.length + LIST_SPARE;
  const first = LIST_HEADER_ROW + 1;
  return { list: spec.lists[i], col: L, first, slots, range: `'${SETTINGS_TAB}'!$${L}$${first}:$${L}$${first + slots - 1}` };
}

/** The ranges (one per sheet) for a tab's column, or null if they don't exist. */
export function columnRanges(spec: SheetSpec, tabName: string, colName: string): string[] | null {
  const tab = spec.tabs.find((t) => t.name.toLowerCase() === tabName.trim().toLowerCase());
  const i = tab ? tab.columns.findIndex((c) => c.header.toLowerCase() === colName.trim().toLowerCase()) : -1;
  if (!tab || i < 0) return null;
  const L = colLetter(i);
  return sheetNames(tab).map((n) => `'${n}'!$${L}$${TAB_FIRST_ROW}:$${L}$${TAB_FIRST_ROW + tabRowCount(tab) - 1}`);
}

/** Where each input and summary value lives on the Dashboard (column C). */
export function summaryCells(spec: SheetSpec) {
  const inputs = new Map<string, string>();
  const items = new Map<string, string>();
  let row = SUMMARY_FIRST_ROW;
  for (const i of spec.inputs) inputs.set(i.label.toLowerCase(), `'${SUMMARY_TAB}'!$C$${row++}`);
  if (spec.inputs.length) row++;
  for (const s of spec.summary) items.set(s.label.toLowerCase(), `'${SUMMARY_TAB}'!$C$${row++}`);
  return { inputs, items, nextRow: row };
}

export interface DashBlock {
  kind: "breakdown" | "trend";
  index: number;
  titleRow: number;
  headerRow: number;
  firstRow: number;
  rows: number;
  /** Columns: label in E, values from F. */
  valueCols: number;
  chart: { fromCol: number; fromRow: number; toCol: number; toRow: number } | null;
}

/**
 * The Dashboard: inputs, totals and goals down columns B–C; breakdown and
 * trend tables from column E, each with its chart beside it.
 */
export function dashboardLayout(spec: SheetSpec) {
  const cells = summaryCells(spec);
  let row = cells.nextRow + (spec.summary.length ? 1 : 0);
  const goals = spec.goals.map((g) => ({ ...g, row: row++ }));
  const blocks: DashBlock[] = [];
  let top = SUMMARY_FIRST_ROW;
  const add = (kind: DashBlock["kind"], index: number, rows: number, valueCols: number, chart: ChartKind) => {
    const chartCol = 4 + 1 + valueCols + 1; // E + values + a gap
    const tableEnd = top + 2 + rows; // title, header, rows, total
    const chartBox = chart === "none" ? null : { fromCol: chartCol, fromRow: top - 1, toCol: chartCol + 7, toRow: top - 1 + 17 };
    blocks.push({ kind, index, titleRow: top, headerRow: top + 1, firstRow: top + 2, rows, valueCols, chart: chartBox });
    top = Math.max(tableEnd + 1, chartBox ? chartBox.toRow + 1 : 0) + 2;
  };
  spec.breakdowns.forEach((b, i) => add("breakdown", i, listPlace(spec, b.list)?.slots ?? 0, 1, b.chart));
  spec.trends.forEach((t, i) => add("trend", i, 12, t.series.length, t.chart));
  return { ...cells, goals, blocks, lastRow: Math.max(row, top) };
}

// ───────────── The safe formula language ─────────────

const ARITH = /^[\d\s.+\-*/()]*$/;

/** Translate a per-row column formula to Excel for the given row. Returns null if it isn't allowed. */
export function columnFormula(formula: string, tab: SheetTab, row: number, spec: SheetSpec): string | null {
  // Check the shape first: references, numbers and arithmetic only.
  const skeleton = formula.replace(/\{[^{}]+\}/g, "0");
  if (!ARITH.test(skeleton) || !balanced(formula)) return null;
  const cells = summaryCells(spec);
  let bad = false;
  let usesColumn = false;
  const out = formula.replace(/\{([^{}]+)\}/g, (_, ref: string) => {
    const r = ref.trim();
    if (/^input:/i.test(r)) {
      const cell = cells.inputs.get(r.slice(6).trim().toLowerCase());
      if (!cell) bad = true;
      return cell ?? "0";
    }
    const i = tab.columns.findIndex((c) => c.header.toLowerCase() === r.toLowerCase());
    if (i < 0 || tab.columns[i].formula) bad = true; // no chains: keeps every formula simple
    usesColumn = true;
    return `${colLetter(Math.max(0, i))}${row}`;
  });
  return bad || !usesColumn ? null : out.trim();
}

export const FUNC_CALL = /\b(SUM|AVERAGE|COUNT|COUNTA|MAX|MIN)\s*\(\s*([^[\]()]+?)\[([^\]]+)\]\s*\)/gi;
export const COUNTIF_CALL = /COUNTIF\s*\(\s*([^[\]()]+?)\[([^\]]+)\]\s*,\s*"([^"]{0,40})"\s*\)/gi;
export const SUMIF_CALL = /SUMIF\s*\(\s*([^[\]()]+?)\[([^\]]+)\]\s*,\s*"([^"]{0,40})"\s*,\s*([^[\]()]+?)\[([^\]]+)\]\s*\)/gi;

/** Translate a summary formula to Excel. Only earlier summary items can be referenced. Returns null if it isn't allowed. */
export function summaryFormula(formula: string, spec: SheetSpec, upTo: number): string | null {
  const skeleton = formula
    .replace(SUMIF_CALL, "0")
    .replace(COUNTIF_CALL, "0")
    .replace(FUNC_CALL, "0")
    .replace(/\{input:[^{}]+\}/gi, "0")
    .replace(/\[[^\]]+\]/g, "0");
  if (!ARITH.test(skeleton) || !skeleton.trim() || !balanced(formula.replace(/"[^"]*"/g, ""))) return null;
  const cells = summaryCells(spec);
  const earlier = new Set(spec.summary.slice(0, upTo).map((s) => s.label.toLowerCase()));
  let bad = false;
  // A monthly tab's column is 12 ranges (Jan … Dec); everything below handles that.
  const rangesOf = (tabName: string, colName: string) => {
    const r = columnRanges(spec, tabName, colName);
    if (!r) bad = true;
    return r ?? ["A1"];
  };
  const out = formula
    .replace(SUMIF_CALL, (_, t, c, v, t2, c2) => {
      const crit = rangesOf(t, c);
      const sums = rangesOf(t2, c2);
      if (crit.length !== sums.length) bad = true; // must be the same tab
      return `(${crit.map((r, i) => `SUMIF(${r},"${v}",${sums[i] ?? r})`).join("+")})`;
    })
    .replace(COUNTIF_CALL, (_, t, c, v) => `(${rangesOf(t, c).map((r) => `COUNTIF(${r},"${v}")`).join("+")})`)
    .replace(FUNC_CALL, (_, f, t, c) => `${f.toUpperCase()}(${rangesOf(t, c).join(",")})`)
    .replace(/\{input:([^{}]+)\}/gi, (_, l: string) => {
      const cell = cells.inputs.get(l.trim().toLowerCase());
      if (!cell) bad = true;
      return cell ?? "0";
    })
    .replace(/(?<!')\[([^\]]+)\]/g, (_, l: string) => {
      const key = l.trim().toLowerCase();
      if (!earlier.has(key)) bad = true;
      return cells.items.get(key) ?? "0";
    });
  return bad ? null : out.trim();
}

function balanced(s: string) {
  let depth = 0;
  for (const ch of s.replace(/"[^"]*"/g, "")) {
    if (ch === "(") depth++;
    if (ch === ")" && --depth < 0) return false;
  }
  return depth === 0;
}

/** A "keep an eye on it" divide: wrap divisions so an empty sheet shows 0 rather than #DIV/0!. */
export const guardDivide = (f: string) => (f.includes("/") ? `IFERROR(${f},0)` : f);

// ───────────── Tidy the AI's draft into something we can build ─────────────

const hex = (s: unknown, fallback: string) => (typeof s === "string" && /^#[0-9a-f]{6}$/i.test(s.trim()) ? s.trim() : fallback);
const oneOf = <T extends string>(list: readonly T[], v: unknown, fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);

const DEFAULT_WIDTH: Record<ColumnType, number> = { text: 24, money: 14, number: 12, date: 14, percent: 12, checkbox: 12, choice: 16 };

export interface RawSpec {
  title?: unknown;
  subtitle?: unknown;
  currency?: unknown;
  accent?: unknown;
  howTo?: unknown;
  inputs?: unknown;
  summary?: unknown;
  tabs?: unknown;
  lists?: unknown;
  breakdowns?: unknown;
  trends?: unknown;
  goals?: unknown;
  marketing?: unknown;
}

/**
 * Turn the Analyst's draft into a safe, buildable spec: names cleaned, limits
 * applied, every formula checked. Broken formulas are dropped (the column
 * becomes a normal input column; a broken summary line is removed).
 */
export function tidySheetSpec(raw: RawSpec, fallbackTitle: string): { spec: SheetSpec; dropped: string[] } {
  const dropped: string[] = [];
  const arr = (x: unknown) => (Array.isArray(x) ? x : []);
  const same = (a: string, b: unknown) => a.toLowerCase() === String(b ?? "").trim().toLowerCase();

  // Settings lists first: columns can take their dropdowns from them.
  const lists: SheetList[] = [];
  for (const l of arr(raw.lists).slice(0, LIMITS.lists) as Record<string, unknown>[]) {
    const name = clean(l?.name, 30).replace(/[{}[\]]/g, "");
    const items = [...new Set(arr(l?.items).map((x) => clean(x, 40).replace(/[",]/g, "")).filter(Boolean))].slice(0, LIMITS.listItems);
    if (name && items.length && !lists.some((x) => same(x.name, name))) lists.push({ name, items });
  }

  const reserved = [SUMMARY_TAB, HOW_TO_TAB, SETTINGS_TAB, ...MONTHS].map((x) => x.toLowerCase());
  const seenTabs = new Set<string>(reserved);
  const tabs: SheetTab[] = [];
  let monthly = false;
  for (const t of arr(raw.tabs).slice(0, LIMITS.tabs) as Record<string, unknown>[]) {
    let name = safeTabName(String(t?.name ?? `Sheet ${tabs.length + 1}`));
    while (seenTabs.has(name.toLowerCase())) name = safeTabName(`${name} ${tabs.length + 2}`);
    seenTabs.add(name.toLowerCase());
    const seenCols = new Set<string>();
    const columns: SheetColumn[] = [];
    for (const c of arr(t?.columns).slice(0, LIMITS.columns) as Record<string, unknown>[]) {
      const header = clean(c?.header, 30).replace(/[{}[\]]/g, "");
      if (!header || seenCols.has(header.toLowerCase())) continue;
      seenCols.add(header.toLowerCase());
      const type = oneOf(COLUMN_TYPES, c?.type, "text");
      const options =
        type === "choice" ? arr(c?.options).map((o) => clean(o, 30).replace(/[",]/g, "")).filter(Boolean).slice(0, 12) : type === "checkbox" ? ["Yes", "No"] : undefined;
      const formula = typeof c?.formula === "string" && c.formula.trim() ? clean(c.formula, 200) : undefined;
      const from = lists.find((x) => same(x.name, c?.optionsFrom));
      if (from) {
        columns.push({ header, type: "choice", options: from.items, optionsFrom: from.name, formula, width: DEFAULT_WIDTH.choice });
        continue;
      }
      columns.push({ header, type: type === "choice" && !options?.length ? "text" : type, options, formula, width: DEFAULT_WIDTH[type] });
    }
    if (!columns.length) continue;
    const exampleRows = arr(t?.exampleRows)
      .slice(0, LIMITS.exampleRows)
      .map((r) => columns.map((col, i) => cellValue(arr(r)[i], col)));
    const blankRows = Math.max(10, Math.min(LIMITS.blankRows, Math.round(Number(t?.blankRows) || 40)));
    // One tab can repeat for every month (12 tabs: Jan … Dec).
    const repeat = t?.repeat === "months" && !monthly ? ("months" as const) : undefined;
    if (repeat) monthly = true;
    else if (t?.repeat === "months") dropped.push(`Only one tab can repeat monthly, so "${name}" is a single tab.`);
    tabs.push({ name, columns, exampleRows, blankRows, totals: t?.totals !== false, ...(repeat ? { repeat } : {}) });
  }
  if (!tabs.length) {
    tabs.push({
      name: "Tracker",
      columns: [
        { header: "Item", type: "text", width: 28 },
        { header: "Notes", type: "text", width: 30 },
        { header: "Done?", type: "checkbox", options: ["Yes", "No"], width: 12 },
      ],
      exampleRows: [],
      blankRows: 40,
      totals: false,
    });
    dropped.push("No usable tabs in the design, so a simple tracker was used.");
  }

  const seenInputs = new Set<string>();
  const inputs: SheetInput[] = [];
  for (const i of arr(raw.inputs).slice(0, LIMITS.inputs) as Record<string, unknown>[]) {
    const label = clean(i?.label, 40).replace(/[{}[\]]/g, "");
    if (!label || seenInputs.has(label.toLowerCase())) continue;
    seenInputs.add(label.toLowerCase());
    inputs.push({ label, type: oneOf(VALUE_TYPES, i?.type, "money"), example: Number.isFinite(Number(i?.example)) ? Number(i?.example) : 0 });
  }

  const spec: SheetSpec = {
    title: clean(raw.title, 60) || clean(fallbackTitle, 60) || "My Tracker",
    subtitle: clean(raw.subtitle, 120),
    currency: clean(raw.currency, 3) || "£",
    accent: hex(raw.accent, "#e89a1c"),
    howTo: arr(raw.howTo).map((s) => clean(s, 200)).filter(Boolean).slice(0, LIMITS.howTo),
    inputs,
    summary: [],
    tabs,
    lists,
    breakdowns: [],
    trends: [],
    goals: [],
  };

  // Column formulas: keep only the ones that translate.
  for (const tab of spec.tabs) {
    for (const col of tab.columns) {
      if (!col.formula) continue;
      if (!columnFormula(col.formula, tab, TAB_FIRST_ROW, spec)) {
        dropped.push(`Formula for "${col.header}" (${col.formula}) didn't check out, so it's a normal column.`);
        col.formula = undefined;
      } else if (col.type === "text" || col.type === "date" || col.type === "checkbox" || col.type === "choice") {
        col.type = "number";
      }
    }
    // Example values in calculated columns would overwrite the formula.
    const calc = tab.columns.map((c) => !!c.formula);
    tab.exampleRows = tab.exampleRows.map((r) => r.map((v, i) => (calc[i] ? null : v)));
  }

  // Summary items, one at a time so later ones can use earlier ones.
  const seenSummary = new Set<string>();
  for (const s of arr(raw.summary).slice(0, LIMITS.summary) as Record<string, unknown>[]) {
    const label = clean(s?.label, 40).replace(/[{}[\]]/g, "");
    const formula = clean(s?.formula, 300);
    if (!label || !formula || seenSummary.has(label.toLowerCase())) continue;
    const item: SummaryItem = { label, formula, type: oneOf(VALUE_TYPES, s?.type, "money") };
    spec.summary.push(item);
    if (!summaryFormula(formula, spec, spec.summary.length - 1)) {
      spec.summary.pop();
      dropped.push(`Summary line "${label}" (${formula}) didn't check out, so it was left out.`);
    } else seenSummary.add(label.toLowerCase());
  }
  // Dashboard parts: each must point at things that exist.
  const tabOf = (n: unknown) => spec.tabs.find((t) => same(t.name, n));
  const colOf = (t: SheetTab | undefined, n: unknown) => t?.columns.find((c) => same(c.header, n));
  const isNum = (c: SheetColumn | undefined) => !!c && (c.type === "money" || c.type === "number");
  for (const b of arr(raw.breakdowns).slice(0, LIMITS.breakdowns) as Record<string, unknown>[]) {
    const tab = tabOf(b?.tab);
    const list = lists.find((x) => same(x.name, b?.list));
    const by = colOf(tab, b?.by);
    const sum = colOf(tab, b?.sum);
    if (!tab || !list || !by || !isNum(sum)) {
      dropped.push(`Breakdown "${clean(b?.title, 40)}" didn't point at a real list, tab and columns, so it was left out.`);
      continue;
    }
    spec.breakdowns.push({ title: clean(b?.title, 40) || `${sum!.header} by ${list.name}`, list: list.name, tab: tab.name, by: by.header, sum: sum!.header, chart: oneOf(CHART_KINDS, b?.chart, "doughnut") });
  }
  for (const t of arr(raw.trends).slice(0, LIMITS.trends) as Record<string, unknown>[]) {
    const tab = tabOf(t?.tab);
    const series = arr(t?.series)
      .map((n) => colOf(tab, n))
      .filter(isNum)
      .slice(0, LIMITS.series)
      .map((c) => c!.header);
    if (!tab || tab.repeat !== "months" || !series.length) {
      dropped.push(`Trend "${clean(t?.title, 40)}" needs a monthly tab and number columns, so it was left out.`);
      continue;
    }
    spec.trends.push({ title: clean(t?.title, 40) || "Month by month", tab: tab.name, series, chart: oneOf(CHART_KINDS, t?.chart, "bar") });
  }
  for (const g of arr(raw.goals).slice(0, LIMITS.goals) as Record<string, unknown>[]) {
    const current = spec.summary.find((x) => same(x.label, g?.current));
    const target = spec.inputs.find((x) => same(x.label, g?.target));
    if (!current || !target) {
      dropped.push(`Goal "${clean(g?.label, 40)}" needs a summary line and an input, so it was left out.`);
      continue;
    }
    spec.goals.push({ label: clean(g?.label, 40) || `${current.label} vs ${target.label}`, current: current.label, target: target.label });
  }

  const m = (raw.marketing ?? {}) as Record<string, unknown>;
  const badges = arr(m.badges).map((b) => clean(b, 18).toUpperCase()).filter(Boolean).slice(0, 4);
  const features = arr(m.features).map((f) => clean(f, 60)).filter(Boolean).slice(0, 6);
  if (clean(m.tagline, 80) || badges.length || features.length) spec.marketing = { tagline: clean(m.tagline, 80), badges, features };

  if (!spec.howTo.length) {
    spec.howTo = ["Fill in the white cells. Shaded cells work themselves out.", "Delete the example rows when you're ready.", "Totals update as you type."];
  }
  return { spec, dropped };
}

function cellValue(v: unknown, col: SheetColumn): string | number | null {
  if (v === null || v === undefined || v === "") return null;
  if (col.type === "money" || col.type === "number" || col.type === "percent") {
    const n = Number(String(v).replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  if (col.type === "checkbox") return /^(y|yes|true|1|✓|✔)$/i.test(String(v).trim()) ? "Yes" : "No";
  if (col.type === "choice") {
    const s = clean(v, 30);
    return col.options?.find((o) => o.toLowerCase() === s.toLowerCase()) ?? col.options?.[0] ?? s;
  }
  return clean(v, 80) || null;
}

/** JSON schema handed to the AI, matching RawSpec. */
export const SHEET_JSON_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    subtitle: { type: "string" },
    currency: { type: "string" },
    accent: { type: "string" },
    howTo: { type: "array", items: { type: "string" } },
    inputs: {
      type: "array",
      items: { type: "object", properties: { label: { type: "string" }, type: { type: "string", enum: [...VALUE_TYPES] }, example: { type: "number" } }, required: ["label", "type", "example"] },
    },
    summary: {
      type: "array",
      items: { type: "object", properties: { label: { type: "string" }, formula: { type: "string" }, type: { type: "string", enum: [...VALUE_TYPES] } }, required: ["label", "formula", "type"] },
    },
    tabs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          columns: {
            type: "array",
            items: {
              type: "object",
              properties: {
                header: { type: "string" },
                type: { type: "string", enum: [...COLUMN_TYPES] },
                options: { type: "array", items: { type: "string" } },
                optionsFrom: { type: "string" },
                formula: { type: "string" },
              },
              required: ["header", "type"],
            },
          },
          exampleRows: { type: "array", items: { type: "array", items: { type: "string" } } },
          blankRows: { type: "number" },
          totals: { type: "boolean" },
          repeat: { type: "string", enum: ["months", "none"] },
        },
        required: ["name", "columns", "exampleRows"],
      },
    },
    lists: {
      type: "array",
      items: { type: "object", properties: { name: { type: "string" }, items: { type: "array", items: { type: "string" } } }, required: ["name", "items"] },
    },
    breakdowns: {
      type: "array",
      items: {
        type: "object",
        properties: { title: { type: "string" }, list: { type: "string" }, tab: { type: "string" }, by: { type: "string" }, sum: { type: "string" }, chart: { type: "string", enum: [...CHART_KINDS] } },
        required: ["title", "list", "tab", "by", "sum", "chart"],
      },
    },
    trends: {
      type: "array",
      items: {
        type: "object",
        properties: { title: { type: "string" }, tab: { type: "string" }, series: { type: "array", items: { type: "string" } }, chart: { type: "string", enum: [...CHART_KINDS] } },
        required: ["title", "tab", "series", "chart"],
      },
    },
    goals: {
      type: "array",
      items: { type: "object", properties: { label: { type: "string" }, current: { type: "string" }, target: { type: "string" } }, required: ["label", "current", "target"] },
    },
    marketing: {
      type: "object",
      properties: { tagline: { type: "string" }, badges: { type: "array", items: { type: "string" } }, features: { type: "array", items: { type: "string" } } },
      required: ["tagline", "badges", "features"],
    },
  },
  required: ["title", "subtitle", "howTo", "inputs", "summary", "tabs"],
};

/** The rules, in plain words, for the AI prompt. */
export const SHEET_RULES = `Design rules:
- Aim for the depth of a best-selling Etsy template: a complete system, not a single table. 1 to ${LIMITS.tabs} tab designs (a "${HOW_TO_TAB}", a "${SUMMARY_TAB}" and, if you use lists, a "${SETTINGS_TAB}" tab are added automatically; don't include them). Up to ${LIMITS.columns} columns per tab.
- A tab with "repeat": "months" becomes 12 tabs (Jan … Dec), e.g. a monthly budget or habit log. Only one tab can repeat. In formulas, Tab[Column] on that tab means all 12 months.
- "lists": editable lists on the ${SETTINGS_TAB} tab (e.g. Categories: Rent, Groceries, Bills…; up to ${LIMITS.listItems} items). A choice column can use "optionsFrom": "<list name>" so its dropdown follows the list.
- "breakdowns": a total per list item, e.g. { title: "Spending by category", list: "Categories", tab: "Monthly", by: "Category", sum: "Amount", chart: "doughnut" }. "by" must be a column using that list.
- "trends": month-by-month totals of a monthly tab, e.g. { title: "Income vs spending", tab: "Monthly", series: ["Income", "Amount"], chart: "bar" } (up to ${LIMITS.series} series; chart "bar" or "line").
- "marketing": words for the listing photos: "tagline" (the main parts joined with " | ", e.g. "Monthly Budget | Debt Tracker | Savings Goals"), 3-4 "badges" (max 18 characters each, e.g. "16 TABS", "AUTO DASHBOARD", "12 MONTHS"), and 5-6 "features" (short benefits, e.g. "Totals update as you type").
- "goals": progress bars, e.g. { label: "Savings goal", current: "<summary label>", target: "<input label>" }.
- Column types: ${COLUMN_TYPES.join(", ")}. "choice" needs 2-8 options (or optionsFrom). "checkbox" is a Yes/No dropdown.
- A column can be calculated with "formula" using ONLY other columns in the same tab in curly braces, numbers and + - * / ( ), e.g. "{Budget} - {Spent}" or "{Price} * {Qty}". Inputs can be used as {input:Label}. A calculated column must not use another calculated column.
- "inputs": things the buyer types once (e.g. "Monthly take-home pay"), with a realistic example number.
- "summary": the dashboard totals. Formula language ONLY: SUM(Tab[Column]), AVERAGE(Tab[Column]), COUNT(Tab[Column]), COUNTA(Tab[Column]), MAX(...), MIN(...), COUNTIF(Tab[Column], "Yes"), SUMIF(Tab[Column], "Text", Tab[NumberColumn]), {input:Label}, [Earlier summary label], numbers and + - * / ( ). Example: "{input:Christmas budget} - [Total spent]".
- "exampleRows": 3-6 realistic example rows per tab (values in column order; leave calculated columns empty).
- Never calculate tax, National Insurance, pensions or interest rates. Buyers type their own take-home figures.
- No brands, characters or celebrities.`;

// ───────────── Preview maths: work out the example numbers for previews ─────────────

/** Evaluate plain arithmetic (numbers, + - * / and brackets). Division by zero gives 0. */
export function evalArith(expr: string): number {
  const tokens = expr.match(/\d+(?:\.\d+)?|[-+*/()]/g) ?? [];
  let i = 0;
  const peek = () => tokens[i];
  const factor = (): number => {
    const t = tokens[i++];
    if (t === "-") return -factor();
    if (t === "+") return factor();
    if (t === "(") {
      const v = sum();
      i++; // ")"
      return v;
    }
    return Number(t) || 0;
  };
  const product = (): number => {
    let v = factor();
    while (peek() === "*" || peek() === "/") {
      const op = tokens[i++];
      const r = factor();
      v = op === "*" ? v * r : r === 0 ? 0 : v / r;
    }
    return v;
  };
  const sum = (): number => {
    let v = product();
    while (peek() === "+" || peek() === "-") v = tokens[i++] === "+" ? v + product() : v - product();
    return v;
  };
  const v = tokens.length ? sum() : 0;
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
}

const num = (v: unknown) => (typeof v === "number" ? v : Number(String(v ?? "").replace(/[^0-9.-]/g, "")) || 0);

/** The example rows with calculated columns filled in, and the dashboard worked out, for previews. */
export function previewValues(spec: SheetSpec) {
  const inputs = new Map(spec.inputs.map((x) => [x.label.toLowerCase(), x.example]));
  const calc = (tab: SheetTab, rows: (string | number | null)[][]) =>
    rows.map((row) =>
      tab.columns.map((c, i) => {
        if (!c.formula) return row[i];
        return evalArith(
          c.formula.replace(/\{([^{}]+)\}/g, (_, ref: string) => {
            const r = ref.trim();
            if (/^input:/i.test(r)) return `(${inputs.get(r.slice(6).trim().toLowerCase()) ?? 0})`;
            const j = tab.columns.findIndex((x) => x.header.toLowerCase() === r.toLowerCase());
            return `(${num(row[j])})`;
          }),
        );
      }),
    );
  const tabs = spec.tabs.map((tab) => {
    const sheets = sheetNames(tab).map((name, m) => ({ name, rows: calc(tab, monthExampleRows(tab, tab.repeat === "months" ? m : null)) }));
    // `rows` = the first sheet (what a preview shows); `all` = every month together (what totals use).
    return { name: tab.name, rows: sheets[0].rows, sheets, all: sheets.flatMap((x) => x.rows) };
  });
  const tabIndex = (n: string) => spec.tabs.findIndex((t) => t.name.toLowerCase() === n.trim().toLowerCase());
  const colIndex = (ti: number, n: string) => (ti < 0 ? -1 : spec.tabs[ti].columns.findIndex((c) => c.header.toLowerCase() === n.trim().toLowerCase()));
  const column = (tabName: string, colName: string) => {
    const ti = tabIndex(tabName);
    const ci = colIndex(ti, colName);
    return ci < 0 ? [] : tabs[ti].all.map((r) => r[ci]);
  };
  const summary = new Map<string, number>();
  for (const item of spec.summary) {
    const expr = item.formula
      .replace(SUMIF_CALL, (_, t, c, v: string, t2, c2) => {
        const crit = column(t, c);
        const sums = column(t2, c2);
        return `(${crit.reduce<number>((a, x, i) => (String(x ?? "").toLowerCase() === v.toLowerCase() ? a + num(sums[i]) : a), 0)})`;
      })
      .replace(COUNTIF_CALL, (_, t, c, v: string) => `(${column(t, c).filter((x) => String(x ?? "").toLowerCase() === v.toLowerCase()).length})`)
      .replace(FUNC_CALL, (_, f: string, t, c) => {
        const all = column(t, c);
        const vals = all.filter((x) => x !== null && x !== "" && typeof x === "number").map(num);
        const fn = f.toUpperCase();
        const v =
          fn === "SUM" ? vals.reduce((a, b) => a + b, 0)
          : fn === "AVERAGE" ? (vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0)
          : fn === "COUNT" ? vals.length
          : fn === "COUNTA" ? all.filter((x) => x !== null && x !== "").length
          : fn === "MAX" ? (vals.length ? Math.max(...vals) : 0)
          : vals.length ? Math.min(...vals) : 0;
        return `(${v})`;
      })
      .replace(/\{input:([^{}]+)\}/gi, (_, l: string) => `(${inputs.get(l.trim().toLowerCase()) ?? 0})`)
      .replace(/\[([^\]]+)\]/g, (_, l: string) => `(${summary.get(l.trim().toLowerCase()) ?? 0})`);
    summary.set(item.label.toLowerCase(), evalArith(expr));
  }
  const breakdowns = spec.breakdowns.map((b) => {
    const by = column(b.tab, b.by);
    const sums = column(b.tab, b.sum);
    const list = spec.lists.find((l) => l.name === b.list)?.items ?? [];
    return { ...b, items: list.map((label) => ({ label, value: Math.round(by.reduce<number>((a, x, i) => (x === label ? a + num(sums[i]) : a), 0) * 100) / 100 })) };
  });
  const trends = spec.trends.map((t) => {
    const ti = tabIndex(t.tab);
    return {
      ...t,
      months: tabs[ti].sheets.map((sh) => ({
        month: sh.name,
        values: t.series.map((col) => Math.round(sh.rows.reduce<number>((a, r) => a + num(r[colIndex(ti, col)]), 0) * 100) / 100),
      })),
    };
  });
  const goals = spec.goals.map((g) => {
    const current = summary.get(g.current.toLowerCase()) ?? 0;
    const target = inputs.get(g.target.toLowerCase()) ?? 0;
    return { ...g, value: target ? Math.round((current / target) * 1000) / 10 : 0 };
  });
  return { tabs, summary: spec.summary.map((s) => ({ ...s, value: summary.get(s.label.toLowerCase()) ?? 0 })), breakdowns, trends, goals };
}

/** Show a value the way the sheet formats it. */
export function formatValue(v: unknown, type: ColumnType | ValueType, currency: string): string {
  if (v === null || v === undefined || v === "") return "";
  if (type === "money") return `${num(v) < 0 ? "-" : ""}${currency}${Math.abs(num(v)).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (type === "percent") return `${Math.round(num(v) * 10) / 10}%`;
  if (type === "number") return String(Math.round(num(v) * 100) / 100);
  return String(v);
}
