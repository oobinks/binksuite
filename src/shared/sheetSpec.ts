// 📊 The design of a spreadsheet / printable tracker, as the Analyst writes it.
//
// The AI never writes raw Excel formulas. It uses a tiny, safe language that we
// check and translate here, so every formula in a file we sell actually works:
//
//   Column formulas (per row):   {Budget} - {Spent}        {Price} * {Qty}
//                                {input:Monthly take-home pay} - {Total}
//   Summary formulas:            SUM(Gifts[Spent])   COUNTIF(Gifts[Bought?], "Yes")
//                                {input:Christmas budget} - [Total spent]
//                                ([Bought] / [Gifts]) * 100
//
// Only numbers, + - * / ( ), column/input/summary references and
// SUM AVERAGE COUNT COUNTA MAX MIN COUNTIF are allowed. Anything else is dropped.

export const COLUMN_TYPES = ["text", "money", "number", "date", "percent", "checkbox", "choice"] as const;
export type ColumnType = (typeof COLUMN_TYPES)[number];
export const VALUE_TYPES = ["money", "number", "percent"] as const;
export type ValueType = (typeof VALUE_TYPES)[number];

export interface SheetColumn {
  header: string;
  type: ColumnType;
  /** Dropdown options (type = choice). Checkbox columns get Yes / No. */
  options?: string[];
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
}

export const LIMITS = { tabs: 4, columns: 10, exampleRows: 8, blankRows: 120, inputs: 6, summary: 10, howTo: 8 } as const;

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
export const SUMMARY_TAB = "Summary";
export const HOW_TO_TAB = "How to use";

export function tabRowCount(t: SheetTab) {
  return t.exampleRows.length + t.blankRows;
}

/** Where each input and summary value lives on the Summary tab (column C). */
export function summaryCells(spec: SheetSpec) {
  const inputs = new Map<string, string>();
  const items = new Map<string, string>();
  let row = SUMMARY_FIRST_ROW;
  for (const i of spec.inputs) inputs.set(i.label.toLowerCase(), `'${SUMMARY_TAB}'!$C$${row++}`);
  if (spec.inputs.length) row++;
  for (const s of spec.summary) items.set(s.label.toLowerCase(), `'${SUMMARY_TAB}'!$C$${row++}`);
  return { inputs, items };
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

/** Translate a summary formula to Excel. Only earlier summary items can be referenced. Returns null if it isn't allowed. */
export function summaryFormula(formula: string, spec: SheetSpec, upTo: number): string | null {
  const skeleton = formula
    .replace(COUNTIF_CALL, "0")
    .replace(FUNC_CALL, "0")
    .replace(/\{input:[^{}]+\}/gi, "0")
    .replace(/\[[^\]]+\]/g, "0");
  if (!ARITH.test(skeleton) || !skeleton.trim() || !balanced(formula.replace(/"[^"]*"/g, ""))) return null;
  const cells = summaryCells(spec);
  const earlier = new Set(spec.summary.slice(0, upTo).map((s) => s.label.toLowerCase()));
  let bad = false;
  const rangeOf = (tabName: string, colName: string) => {
    const tab = spec.tabs.find((t) => t.name.toLowerCase() === tabName.trim().toLowerCase());
    const i = tab ? tab.columns.findIndex((c) => c.header.toLowerCase() === colName.trim().toLowerCase()) : -1;
    if (!tab || i < 0) {
      bad = true;
      return "A1";
    }
    const L = colLetter(i);
    return `'${tab.name}'!$${L}$${TAB_FIRST_ROW}:$${L}$${TAB_FIRST_ROW + tabRowCount(tab) - 1}`;
  };
  const out = formula
    .replace(COUNTIF_CALL, (_, t, c, v) => `COUNTIF(${rangeOf(t, c)},"${v}")`)
    .replace(FUNC_CALL, (_, f, t, c) => `${f.toUpperCase()}(${rangeOf(t, c)})`)
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
}

/**
 * Turn the Analyst's draft into a safe, buildable spec: names cleaned, limits
 * applied, every formula checked. Broken formulas are dropped (the column
 * becomes a normal input column; a broken summary line is removed).
 */
export function tidySheetSpec(raw: RawSpec, fallbackTitle: string): { spec: SheetSpec; dropped: string[] } {
  const dropped: string[] = [];
  const arr = (x: unknown) => (Array.isArray(x) ? x : []);
  const seenTabs = new Set<string>([SUMMARY_TAB.toLowerCase(), HOW_TO_TAB.toLowerCase()]);
  const tabs: SheetTab[] = [];
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
      columns.push({ header, type: type === "choice" && !options?.length ? "text" : type, options, formula, width: DEFAULT_WIDTH[type] });
    }
    if (!columns.length) continue;
    const exampleRows = arr(t?.exampleRows)
      .slice(0, LIMITS.exampleRows)
      .map((r) => columns.map((col, i) => cellValue(arr(r)[i], col)));
    const blankRows = Math.max(10, Math.min(LIMITS.blankRows, Math.round(Number(t?.blankRows) || 40)));
    tabs.push({ name, columns, exampleRows, blankRows, totals: t?.totals !== false });
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
                formula: { type: "string" },
              },
              required: ["header", "type"],
            },
          },
          exampleRows: { type: "array", items: { type: "array", items: { type: "string" } } },
          blankRows: { type: "number" },
          totals: { type: "boolean" },
        },
        required: ["name", "columns", "exampleRows"],
      },
    },
  },
  required: ["title", "subtitle", "howTo", "inputs", "summary", "tabs"],
};

/** The rules, in plain words, for the AI prompt. */
export const SHEET_RULES = `Design rules:
- 1 to ${LIMITS.tabs} tabs (a "${SUMMARY_TAB}" tab and a "${HOW_TO_TAB}" tab are added automatically, don't include them). Up to ${LIMITS.columns} columns per tab.
- Column types: ${COLUMN_TYPES.join(", ")}. "choice" needs 2-8 options. "checkbox" is a Yes/No dropdown.
- A column can be calculated with "formula" using ONLY other columns in the same tab in curly braces, numbers and + - * / ( ), e.g. "{Budget} - {Spent}" or "{Price} * {Qty}". Inputs can be used as {input:Label}. A calculated column must not use another calculated column.
- "inputs": things the buyer types once (e.g. "Monthly take-home pay"), with a realistic example number.
- "summary": the dashboard lines. Formula language ONLY: SUM(Tab[Column]), AVERAGE(Tab[Column]), COUNT(Tab[Column]), COUNTA(Tab[Column]), MAX(...), MIN(...), COUNTIF(Tab[Column], "Yes"), {input:Label}, [Earlier summary label], numbers and + - * / ( ). Example: "{input:Christmas budget} - [Total spent]".
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

/** The example rows with calculated columns filled in, and the summary lines worked out, for previews. */
export function previewValues(spec: SheetSpec) {
  const inputs = new Map(spec.inputs.map((x) => [x.label.toLowerCase(), x.example]));
  const tabs = spec.tabs.map((tab) => {
    const rows = tab.exampleRows.map((row) =>
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
    return { name: tab.name, rows };
  });
  const column = (tabName: string, colName: string) => {
    const ti = spec.tabs.findIndex((t) => t.name.toLowerCase() === tabName.trim().toLowerCase());
    const ci = ti < 0 ? -1 : spec.tabs[ti].columns.findIndex((c) => c.header.toLowerCase() === colName.trim().toLowerCase());
    return ci < 0 ? [] : tabs[ti].rows.map((r) => r[ci]);
  };
  const summary = new Map<string, number>();
  for (const item of spec.summary) {
    const expr = item.formula
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
  return { tabs, summary: spec.summary.map((s) => ({ ...s, value: summary.get(s.label.toLowerCase()) ?? 0 })) };
}

/** Show a value the way the sheet formats it. */
export function formatValue(v: unknown, type: ColumnType | ValueType, currency: string): string {
  if (v === null || v === undefined || v === "") return "";
  if (type === "money") return `${num(v) < 0 ? "-" : ""}${currency}${Math.abs(num(v)).toFixed(2)}`;
  if (type === "percent") return `${Math.round(num(v) * 10) / 10}%`;
  if (type === "number") return String(Math.round(num(v) * 100) / 100);
  return String(v);
}
