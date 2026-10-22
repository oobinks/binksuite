// 📊 The spreadsheet builder. Like the Printer, it runs on YOUR device (free, and far
// too heavy for the Worker): it turns the Analyst's checked design into
//   • an Excel workbook (.xlsx) with real formulas, dropdowns and colours (EXCEL products),
//   • a printable PDF in A4 and US Letter (both EXCEL and PDF products),
//   • two preview pictures for the Etsy listing,
// then zips the files and uploads everything to your storage.
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import JSZip from "jszip";
import fontkit from "@pdf-lib/fontkit";
import { buyerFileName, uploadProductFile, type Deliverable } from "./files";
import type { ProductFormat } from "../../shared/format";
import { addCharts, fixInternalLinks, type ChartSpec } from "./xlsxCharts";
import { buildListingPhotos } from "./listingPhotos";
import { styleOf, type DesignStyle } from "../../shared/designStyles";
import {
  normaliseSpec,
  columnFormula,
  columnRanges,
  dashboardLayout,
  dataSheets,
  hasDashboard,
  listPlace,
  LIST_HEADER_ROW,
  MONTHS,
  monthExampleRows,
  SETTINGS_TAB,
  summaryCells,
  guardDivide,
  HOW_TO_TAB,
  SUMMARY_FIRST_ROW,
  SUMMARY_TAB,
  summaryFormula,
  TAB_FIRST_ROW,
  TAB_HEADER_ROW,
  TAB_FIRST_COL,
  tabColLetter,
  TITLE_ROW,
  SUBTITLE_ROW,
  NAV_ROW,
  KPI_LABEL_ROW,
  KPI_VALUE_ROW,
  sheetNames,
  tabRowCount,
  colLetter,
  type ColumnType,
  type SheetSpec,
  type ValueType,
} from "../../shared/sheetSpec";

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "tracker";
const INK = "#3b2f2a";

/** Mix a colour with white (0 = colour, 1 = white). */
function tint(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => mix(c).toString(16).padStart(2, "0")).join("")}`;
}
const argb = (hex: string) => `FF${hex.slice(1).toUpperCase()}`;

function numFmt(type: ColumnType | ValueType, currency: string, whole = false): string | undefined {
  if (type === "money") return `"${currency.replace(/"/g, "")}"#,##0.00;[Red]-"${currency.replace(/"/g, "")}"#,##0.00`;
  if (type === "percent") return '0.0"%"';
  // ("#,##0.##" would show a stray full stop after whole numbers in Excel.)
  if (type === "number") return whole ? "#,##0" : "#,##0.0";
  if (type === "date") return "dd/mm/yyyy";
  return undefined;
}

// ───────────── Excel ─────────────
// The house style: no gridlines, a margin round every sheet, a title band with
// navigation, airy rows with hairline rules, cream "type here" cells, softly
// shaded "worked out for you" cells, and one accent colour used with restraint.

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MUTED = "#7a6a60";
const RULE = "#e8e3dc";
const INPUT_FILL = "#fff6dd";

/** Mix a colour with black (0 = colour, 1 = black). */
function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c * (1 - amount));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => mix(c).toString(16).padStart(2, "0")).join("")}`;
}

/** Chart colours: the product's accent first, then a warm, distinct palette. */
export function chartPalette(accent: string) {
  return [accent, "#e9a96b", "#7c9cf5", "#9cb59a", "#e0607e", "#c7a27c", "#6d5bd0", "#f2b35b", "#4f9da6", "#b5838d", "#8a9a5b", "#d4a5a5"];
}

/** Counts ("bills still to pay") are whole numbers. */
const isCount = (formula: string) => /^\s*\(?\s*COUNT/i.test(formula);

const sheetLink = (name: string) => `#'${name.replace(/'/g, "''")}'!A1`;

export async function buildWorkbook(spec: SheetSpec): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "BinkSuite";
  wb.created = new Date();
  wb.calcProperties.fullCalcOnLoad = true;
  const accent = spec.accent;
  // The product's design style: its fonts, title treatment and table look.
  const st = styleOf(spec.style);
  const BODY_FONT = st.excel.body;
  const TITLE_FONT = st.excel.title;
  const titleText = (t: string) => (st.display.upper ? t.toUpperCase() : t);
  const deep = shade(accent, 0.3);
  const soft = tint(accent, 0.88);
  const band = tint(accent, 0.955);
  const calc = tint(accent, 0.92);
  const fill = (hex: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: argb(hex) } });
  const font = (o: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> => ({ name: BODY_FONT, size: 10.5, color: { argb: argb(INK) }, ...o });
  const line = (hex: string, style: ExcelJS.BorderStyle = "thin") => ({ style, color: { argb: argb(hex) } });
  // Boxed tables get a light grid; the others hairline rules under each row.
  const rule: Partial<ExcelJS.Borders> =
    st.table === "boxed" ? { top: line(tint(accent, 0.72)), left: line(tint(accent, 0.72)), bottom: line(tint(accent, 0.72)), right: line(tint(accent, 0.72)) } : { bottom: line(st.table === "lined" ? tint(accent, 0.7) : RULE, "hair") };
  /** Alternate-row shading only where the style uses banded rows. */
  const banded = st.table === "banded";
  const sheets = dataSheets(spec);
  const home = hasDashboard(spec) ? SUMMARY_TAB : HOW_TO_TAB;
  const charts: ChartSpec[] = [];
  const palette = chartPalette(accent);
  let sheetCount = 0;
  const addSheet = (name: string, opts: Partial<ExcelJS.AddWorksheetOptions> & { freeze?: number } = {}) => {
    sheetCount++;
    const { freeze, ...rest } = opts;
    const ws = wb.addWorksheet(name, {
      ...rest,
      views: [{ showGridLines: false, zoomScale: 100, ...(freeze ? { state: "frozen" as const, ySplit: freeze, xSplit: 0 } : {}) }],
      properties: { defaultRowHeight: 20, ...rest.properties },
    });
    ws.getColumn(1).width = 2.5;
    ws.getRow(1).height = 8;
    ws.getRow(5).height = 8;
    return ws;
  };

  /** Title band, subtitle and navigation links across columns B..lastCol. */
  const chrome = (ws: ExcelJS.Worksheet, lastCol: number, title: string, subtitle: string | undefined, links: { text: string; to: string; right?: boolean }[]) => {
    const end = Math.max(3, lastCol);
    ws.mergeCells(TITLE_ROW, 2, TITLE_ROW, end);
    const t = ws.getCell(TITLE_ROW, 2);
    t.value = titleText(title);
    // A colour band, an accent title over a thick rule, or a dark block over an accent strip.
    const under = st.header === "underline";
    const block = st.header === "block";
    t.font = { name: TITLE_FONT, size: 22, bold: TITLE_FONT !== "Impact" && TITLE_FONT !== "Georgia", color: { argb: under ? argb(accent) : "FFFFFFFF" } };
    if (!under) t.fill = fill(block ? shade(accent, 0.4) : accent);
    t.alignment = { vertical: "middle", horizontal: "left", indent: under ? 0 : 1 };
    if (under) for (let c = 2; c <= end; c++) ws.getCell(TITLE_ROW, c).border = { bottom: line(accent, "thick") };
    ws.getRow(TITLE_ROW).height = 44;
    ws.mergeCells(SUBTITLE_ROW, 2, SUBTITLE_ROW, end);
    const s = ws.getCell(SUBTITLE_ROW, 2);
    s.value = subtitle ?? "";
    s.font = font({ size: 10, italic: true, color: { argb: block ? "FFFFFFFF" : argb(under ? MUTED : deep) } });
    if (!under) s.fill = fill(block ? accent : soft);
    s.alignment = { vertical: "middle", horizontal: "left", indent: under ? 0 : 1 };
    ws.getRow(SUBTITLE_ROW).height = 22;
    ws.getRow(NAV_ROW).height = 22;
    const left = links.filter((l) => !l.right);
    const right = links.filter((l) => l.right);
    const place = (l: { text: string; to: string }, col: number, align: "left" | "right") => {
      const c = ws.getCell(NAV_ROW, col);
      c.value = { text: l.text, hyperlink: sheetLink(l.to), tooltip: `Go to ${l.to}` };
      c.font = font({ size: 9.5, bold: true, color: { argb: argb(deep) } });
      c.alignment = { vertical: "middle", horizontal: align, indent: 1 };
    };
    left.forEach((l, i) => place(l, 2 + i, "left"));
    right.forEach((l, i) => {
      const col = end - (right.length - 1 - i);
      if (col > 1 + left.length) place(l, col, "right");
    });
  };

  /** A small-caps section heading with an accent rule under it, across columns from..to. */
  const heading = (ws: ExcelJS.Worksheet, row: number, from: number, to: number, text: string) => {
    for (let c = from; c <= to; c++) ws.getCell(row, c).border = { bottom: line(accent, "medium") };
    const h = ws.getCell(row, from);
    h.value = text.toUpperCase();
    h.font = font({ size: 10, bold: true, color: { argb: argb(deep) } });
    h.alignment = { vertical: "bottom", horizontal: "left" };
    ws.getRow(row).height = 24;
  };

  const headerCell = (c: ExcelJS.Cell, text: string, align: "left" | "center" | "right" = "center") => {
    c.value = text;
    c.alignment = { vertical: "middle", horizontal: align, wrapText: true, indent: align === "center" ? 0 : 1 };
    if (st.table === "lined") {
      // Accent words over a thick accent rule.
      c.font = font({ size: 10, bold: true, color: { argb: argb(accent) } });
      c.border = { bottom: line(accent, "medium") };
    } else if (st.table === "boxed") {
      c.fill = fill(shade(accent, 0.35));
      c.font = font({ size: 10, bold: true, color: { argb: "FFFFFFFF" } });
      c.border = { right: line(tint(accent, 0.5)), left: line(tint(accent, 0.5)) };
    } else {
      c.fill = fill(accent);
      c.font = font({ size: 10, bold: true, color: { argb: "FFFFFFFF" } });
      c.border = { right: line(tint(accent, 0.25)) };
    }
  };

  const isNumeric = (t: ColumnType | ValueType) => t === "money" || t === "number" || t === "percent";
  const alignFor = (t: ColumnType | ValueType): Partial<ExcelJS.Alignment> =>
    isNumeric(t) ? { horizontal: "right", vertical: "middle", indent: 1 } : t === "date" || t === "checkbox" || t === "choice" ? { horizontal: "center", vertical: "middle" } : { horizontal: "left", vertical: "middle", indent: 1 };

  // ── How to use (first, so it's what buyers see when they open the file) ──
  {
    const ws = addSheet(HOW_TO_TAB, { properties: { tabColor: { argb: argb(accent) } } });
    ws.getColumn(2).width = 6;
    ws.getColumn(3).width = 96;
    chrome(ws, 3, spec.title, spec.subtitle, hasDashboard(spec) ? [{ text: "⌂  Go to the Dashboard", to: SUMMARY_TAB }] : sheets[0] ? [{ text: `→  Start: ${sheets[0].name}`, to: sheets[0].name }] : []);
    let r = 7;
    const section = (text: string) => {
      heading(ws, r, 2, 3, text);
      r += 2;
    };
    section("Getting started");
    spec.howTo.forEach((step, i) => {
      const n = ws.getCell(r, 2);
      n.value = i + 1;
      n.fill = fill(accent);
      n.font = { name: TITLE_FONT, size: 13, bold: true, color: { argb: "FFFFFFFF" } };
      n.alignment = { horizontal: "center", vertical: "middle" };
      const c = ws.getCell(r, 3);
      c.value = step;
      c.font = font({ size: 11 });
      c.alignment = { wrapText: true, vertical: "middle", indent: 1 };
      ws.getRow(r).height = step.length > 95 ? 40 : 28;
      ws.getRow(r + 1).height = 6;
      r += 2;
    });
    r++;
    section(`What's inside (${sheets.length + 1 + (hasDashboard(spec) ? 1 : 0) + (spec.lists.length ? 1 : 0)} tabs)`);
    const inside: { to: string; text: string }[] = [
      ...(hasDashboard(spec) ? [{ to: SUMMARY_TAB, text: `${SUMMARY_TAB}: your totals${spec.breakdowns.length + spec.trends.length ? " and charts" : ""}, updated as you type` }] : []),
      ...(spec.lists.length ? [{ to: SETTINGS_TAB, text: `${SETTINGS_TAB}: your own ${spec.lists.map((l) => l.name.toLowerCase()).join(" and ")}; the dropdowns and dashboard follow` }] : []),
      ...spec.tabs.map((t) => {
        const first = sheetNames(t)[0];
        return t.repeat === "months" ? { to: first, text: `Jan to Dec: a ${t.name.toLowerCase()} tab for every month` } : { to: first, text: `${first}: ${t.columns.map((c) => c.header.toLowerCase()).join(", ")}` };
      }),
    ];
    for (const item of inside) {
      ws.getCell(r, 2).value = "→";
      ws.getCell(r, 2).font = font({ bold: true, color: { argb: argb(accent) } });
      ws.getCell(r, 2).alignment = { horizontal: "center", vertical: "middle" };
      const c = ws.getCell(r, 3);
      c.value = { text: item.text, hyperlink: sheetLink(item.to), tooltip: `Open ${item.to}` };
      c.font = font({ size: 11, color: { argb: argb(deep) } });
      c.alignment = { vertical: "middle", indent: 1 };
      c.border = rule;
      ws.getRow(r).height = 24;
      r++;
    }
    r++;
    section("Colour key");
    const keys: [string, string, string?][] = [
      [INPUT_FILL, "White rows and cream boxes are for you: type your own entries and numbers here.", tint(accent, 0.45)],
      [calc, "Shaded cells work themselves out. There's no need to touch them."],
      [accent, "Coloured bars are column titles. Click a link above to jump between tabs."],
    ];
    for (const [colour, text, edge] of keys) {
      const sw = ws.getCell(r, 2);
      sw.fill = fill(colour);
      if (edge) sw.border = { top: line(edge), left: line(edge), bottom: line(edge), right: line(edge) };
      const c = ws.getCell(r, 3);
      c.value = text;
      c.font = font({ size: 11 });
      c.alignment = { vertical: "middle", indent: 1 };
      ws.getRow(r).height = 24;
      ws.getRow(r + 1).height = 6;
      r += 2;
    }
    r++;
    section("Good to know");
    for (const tip of [
      "Example entries show how everything works. Overwrite or delete them whenever you're ready.",
      "Works in Microsoft Excel, Google Sheets (File → Import) and Apple Numbers.",
      "Save a fresh copy each year (or each month) to keep your history.",
    ]) {
      const c = ws.getCell(r, 3);
      c.value = tip;
      c.font = font({ size: 10.5, color: { argb: argb(MUTED) } });
      c.alignment = { wrapText: true, vertical: "middle", indent: 1 };
      ws.getCell(r, 2).value = "•";
      ws.getCell(r, 2).font = font({ color: { argb: argb(accent) }, bold: true });
      ws.getCell(r, 2).alignment = { horizontal: "center", vertical: "middle" };
      ws.getRow(r).height = 22;
      r++;
    }
    ws.pageSetup = { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
  }

  // ── Dashboard ──
  const layout = dashboardLayout(spec);
  if (hasDashboard(spec)) {
    const lastCol = Math.max(8, ...layout.blocks.map((b) => (b.chart ? b.chart.toCol : 4 + b.valueCols + 1)));
    const ws = addSheet(SUMMARY_TAB, { properties: { tabColor: { argb: argb(accent) } } });
    const dashIndex = sheetCount;
    const widths: Record<number, number> = { 2: 28, 3: 17, 4: 3, 5: 22, 6: 16, 7: 16, 8: 16 };
    for (let c = 2; c <= lastCol; c++) ws.getColumn(c).width = widths[c] ?? 11;
    chrome(ws, lastCol, spec.title, spec.subtitle, [
      { text: "?  How to use", to: HOW_TO_TAB },
      ...(spec.lists.length ? [{ text: "⚙  Settings", to: SETTINGS_TAB }] : []),
      ...(sheets[0] ? [{ text: `→  ${sheets[0].name}`, to: sheets[0].name, right: true }] : []),
    ]);

    // Headline cards: the first three totals, big and clear.
    const cards: [number, number][] = [
      [2, 3],
      [5, 6],
      [7, 8],
    ];
    spec.summary.slice(0, 3).forEach((item, i) => {
      const [a, b] = cards[i];
      const cell = summaryCells(spec).items.get(item.label.toLowerCase())!.split("!")[1];
      ws.mergeCells(KPI_LABEL_ROW, a, KPI_LABEL_ROW, b);
      ws.mergeCells(KPI_VALUE_ROW, a, KPI_VALUE_ROW, b);
      const label = ws.getCell(KPI_LABEL_ROW, a);
      label.value = item.label.toUpperCase();
      label.font = font({ size: 9, bold: true, color: { argb: argb(deep) } });
      label.alignment = { horizontal: "center", vertical: "bottom" };
      const value = ws.getCell(KPI_VALUE_ROW, a);
      value.value = { formula: cell.replace(/\$/g, "") };
      value.numFmt = numFmt(item.type, spec.currency, isCount(item.formula)) ?? "General";
      value.font = { name: TITLE_FONT, size: 22, color: { argb: argb(accent) } };
      value.alignment = { horizontal: "center", vertical: "middle" };
      const gap = { style: "thick" as const, color: { argb: "FFFFFFFF" } };
      for (let c = a; c <= b; c++) {
        ws.getCell(KPI_LABEL_ROW, c).fill = fill(soft);
        ws.getCell(KPI_VALUE_ROW, c).fill = fill(soft);
        // A white edge keeps neighbouring cards apart.
        ws.getCell(KPI_LABEL_ROW, c).border = { top: line(accent, "thick"), left: c === a ? gap : undefined, right: c === b ? gap : undefined };
        ws.getCell(KPI_VALUE_ROW, c).border = { left: c === a ? gap : undefined, right: c === b ? gap : undefined };
      }
    });
    ws.getRow(KPI_LABEL_ROW).height = 24;
    ws.getRow(KPI_VALUE_ROW).height = 40;
    ws.getRow(KPI_VALUE_ROW + 1).height = 10;

    // Left column: your numbers, at a glance, goals.
    if (layout.headings.inputs) heading(ws, layout.headings.inputs, 2, 3, "Your numbers");
    let row = SUMMARY_FIRST_ROW;
    for (const input of spec.inputs) {
      const l = ws.getCell(row, 2);
      l.value = input.label;
      l.font = font();
      l.alignment = { vertical: "middle" };
      l.border = rule;
      const c = ws.getCell(row, 3);
      c.value = input.example;
      c.numFmt = numFmt(input.type, spec.currency) ?? "General";
      c.fill = fill(INPUT_FILL);
      c.font = font({ size: 11, bold: true });
      c.alignment = { horizontal: "right", vertical: "middle", indent: 1 };
      const edge = line(tint(accent, 0.45));
      c.border = { top: edge, left: edge, bottom: edge, right: edge };
      ws.getRow(row).height = 24;
      row++;
    }
    if (layout.headings.summary) heading(ws, layout.headings.summary, 2, 3, "At a glance");
    if (spec.inputs.length) row += 2;
    spec.summary.forEach((item, i) => {
      const l = ws.getCell(row, 2);
      l.value = item.label;
      l.font = font();
      l.alignment = { vertical: "middle" };
      l.border = rule;
      const f = summaryFormula(item.formula, spec, i);
      const c = ws.getCell(row, 3);
      c.value = f ? { formula: guardDivide(f) } : 0;
      c.numFmt = numFmt(item.type, spec.currency, isCount(item.formula)) ?? "General";
      c.fill = fill(calc);
      c.font = font({ size: 11, bold: true, color: { argb: argb(deep) } });
      c.alignment = { horizontal: "right", vertical: "middle", indent: 1 };
      c.border = rule;
      ws.getRow(row).height = 24;
      row++;
    });
    const cells = summaryCells(spec);
    if (layout.headings.goals) heading(ws, layout.headings.goals, 2, 3, "Goals");
    for (const g of layout.goals) {
      const l = ws.getCell(g.row, 2);
      l.value = g.label;
      l.font = font();
      l.alignment = { vertical: "middle" };
      l.border = rule;
      const cur = cells.items.get(g.current.toLowerCase());
      const tgt = cells.inputs.get(g.target.toLowerCase());
      const c = ws.getCell(g.row, 3);
      c.value = cur && tgt ? { formula: `IFERROR(MIN(100,${cur}/${tgt}*100),0)` } : 0;
      c.numFmt = '0"%"';
      c.font = font({ size: 11, bold: true, color: { argb: argb(deep) } });
      c.alignment = { horizontal: "right", vertical: "middle", indent: 1 };
      c.border = rule;
      ws.getRow(g.row).height = 24;
      ws.addConditionalFormatting({
        ref: `C${g.row}`,
        rules: [{ type: "dataBar", priority: 3, minLength: 0, maxLength: 100, cfvo: [{ type: "num", value: 0 }, { type: "num", value: 100 }], color: { argb: argb(tint(accent, 0.35)) } } as unknown as ExcelJS.ConditionalFormattingRule],
      });
    }

    // Right: breakdown and trend tables, each with its chart beside it.
    const tableRow = (rr: number, cols: number[], k: number) => {
      for (const c of cols) {
        const x = ws.getCell(rr, c);
        x.border = rule;
        if (k % 2 && banded) x.fill = fill(band);
      }
      ws.getRow(rr).height = 20;
    };
    const totalRow = (rr: number, cols: number[]) => {
      for (const c of cols) {
        const x = ws.getCell(rr, c);
        x.font = font({ bold: true, color: { argb: argb(deep) } });
        x.fill = fill(soft);
        x.border = { top: line(accent, "medium") };
      }
      ws.getRow(rr).height = 24;
    };
    for (const b of layout.blocks) {
      const valueCols = Array.from({ length: b.valueCols }, (_, j) => 6 + j);
      heading(ws, b.titleRow, 5, 5 + b.valueCols, b.kind === "breakdown" ? spec.breakdowns[b.index].title : spec.trends[b.index].title);
      ws.getRow(b.headerRow).height = 24;
      if (b.kind === "breakdown") {
        const bd = spec.breakdowns[b.index];
        const place = listPlace(spec, bd.list)!;
        const sumCol = spec.tabs.find((t) => t.name === bd.tab)!.columns.find((c) => c.header === bd.sum)!;
        headerCell(ws.getCell(b.headerRow, 5), bd.list, "left");
        headerCell(ws.getCell(b.headerRow, 6), bd.sum, "right");
        const by = columnRanges(spec, bd.tab, bd.by)!;
        const sums = columnRanges(spec, bd.tab, bd.sum)!;
        for (let k = 0; k < b.rows; k++) {
          const rr = b.firstRow + k;
          const src = `'${SETTINGS_TAB}'!$${place.col}$${place.first + k}`;
          const label = ws.getCell(rr, 5);
          label.value = { formula: `IF(${src}="","",${src})` };
          label.font = font();
          label.alignment = { vertical: "middle", indent: 1 };
          const v = ws.getCell(rr, 6);
          v.value = { formula: `IF(E${rr}="","",${by.map((rg, i) => `SUMIF(${rg},E${rr},${sums[i]})`).join("+")})` };
          v.numFmt = numFmt(sumCol.type, spec.currency) ?? "General";
          v.font = font();
          v.alignment = { horizontal: "right", vertical: "middle", indent: 1 };
          tableRow(rr, [5, 6], k);
        }
        const total = b.firstRow + b.rows;
        ws.getCell(total, 5).value = "Total";
        ws.getCell(total, 5).alignment = { indent: 1, vertical: "middle" };
        ws.getCell(total, 6).value = { formula: `SUM(F${b.firstRow}:F${total - 1})` };
        ws.getCell(total, 6).numFmt = numFmt(sumCol.type, spec.currency) ?? "General";
        ws.getCell(total, 6).alignment = { horizontal: "right", vertical: "middle", indent: 1 };
        totalRow(total, [5, 6]);
        if (b.chart && bd.chart !== "none")
          charts.push({
            sheetIndex: dashIndex,
            kind: bd.chart === "line" ? "line" : bd.chart,
            title: bd.title,
            categories: `'${SUMMARY_TAB}'!$E$${b.firstRow}:$E$${b.firstRow + place.list.items.length - 1}`,
            series: [{ name: bd.sum, ref: `'${SUMMARY_TAB}'!$F$${b.firstRow}:$F$${b.firstRow + place.list.items.length - 1}`, colour: accent }],
            pointColours: place.list.items.map((_, i) => palette[i % palette.length]),
            numberFormat: numFmt(sumCol.type, spec.currency) ?? "General",
            from: { col: b.chart.fromCol, row: b.chart.fromRow },
            to: { col: b.chart.toCol, row: b.chart.toRow },
          });
      } else {
        const tr = spec.trends[b.index];
        const tab = spec.tabs.find((t) => t.name === tr.tab)!;
        headerCell(ws.getCell(b.headerRow, 5), "Month", "left");
        tr.series.forEach((col, j) => headerCell(ws.getCell(b.headerRow, 6 + j), col, "right"));
        const ranges = tr.series.map((col) => columnRanges(spec, tr.tab, col)!);
        const type = tab.columns.find((c) => c.header === tr.series[0])!.type;
        for (let m = 0; m < 12; m++) {
          const rr = b.firstRow + m;
          const label = ws.getCell(rr, 5);
          label.value = MONTH_NAMES[m];
          label.font = font();
          label.alignment = { vertical: "middle", indent: 1 };
          tr.series.forEach((_, j) => {
            const c = ws.getCell(rr, 6 + j);
            c.value = { formula: `SUM(${ranges[j][m]})` };
            c.numFmt = numFmt(type, spec.currency) ?? "General";
            c.font = font();
            c.alignment = { horizontal: "right", vertical: "middle", indent: 1 };
          });
          tableRow(rr, [5, ...valueCols], m);
        }
        const total = b.firstRow + 12;
        ws.getCell(total, 5).value = "Year";
        ws.getCell(total, 5).alignment = { indent: 1, vertical: "middle" };
        tr.series.forEach((_, j) => {
          const c = ws.getCell(total, 6 + j);
          const L = colLetter(5 + j);
          c.value = { formula: `SUM(${L}${b.firstRow}:${L}${total - 1})` };
          c.numFmt = numFmt(type, spec.currency) ?? "General";
          c.alignment = { horizontal: "right", vertical: "middle", indent: 1 };
        });
        totalRow(total, [5, ...valueCols]);
        if (b.chart && tr.chart !== "none")
          charts.push({
            sheetIndex: dashIndex,
            kind: tr.chart === "doughnut" ? "bar" : tr.chart,
            title: tr.title,
            categories: `'${SUMMARY_TAB}'!$E$${b.firstRow}:$E$${b.firstRow + 11}`,
            series: tr.series.map((col, j) => ({ name: col, ref: `'${SUMMARY_TAB}'!$${colLetter(5 + j)}$${b.firstRow}:$${colLetter(5 + j)}$${b.firstRow + 11}`, colour: palette[j] })),
            numberFormat: numFmt(type, spec.currency) ?? "General",
            from: { col: b.chart.fromCol, row: b.chart.fromRow },
            to: { col: b.chart.toCol, row: b.chart.toRow },
          });
      }
    }
    ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
  }

  // ── Settings: the lists buyers can edit ──
  if (spec.lists.length) {
    const ws = addSheet(SETTINGS_TAB, { properties: { tabColor: { argb: argb(tint(accent, 0.4)) } } });
    const lastCol = Math.max(7, spec.lists.length * 2);
    for (let c = 2; c <= lastCol; c++) ws.getColumn(c).width = 14;
    chrome(ws, lastCol, SETTINGS_TAB, "Rename, add or remove items. The dropdowns and the dashboard update to match.", [{ text: `⌂  ${home}`, to: home }]);
    spec.lists.forEach((list, i) => {
      const place = listPlace(spec, list.name)!;
      const col = 2 + i * 2;
      ws.getColumn(col).width = 28;
      if (col + 1 <= lastCol + 1) ws.getColumn(col + 1).width = 4;
      headerCell(ws.getCell(LIST_HEADER_ROW, col), list.name, "left");
      ws.getRow(LIST_HEADER_ROW).height = 26;
      for (let k = 0; k < place.slots; k++) {
        const c = ws.getCell(place.first + k, col);
        c.value = list.items[k] ?? null;
        c.font = font();
        c.alignment = { vertical: "middle", indent: 1 };
        c.border = rule;
        if (k >= list.items.length) c.fill = fill(INPUT_FILL);
        ws.getRow(place.first + k).height = 22;
      }
    });
    ws.pageSetup = { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  }

  // ── The tabs people fill in (a monthly tab becomes Jan … Dec) ──
  for (const [si, { name, tab, month }] of sheets.entries()) {
    const ws = addSheet(name, {
      freeze: TAB_HEADER_ROW,
      properties: { tabColor: month !== null ? { argb: argb(month % 2 ? tint(accent, 0.45) : tint(accent, 0.25)) } : { argb: argb(tint(accent, 0.2)) } },
    });
    const n = tab.columns.length;
    const lastCol = TAB_FIRST_COL + n;
    const first = si === 0;
    tab.columns.forEach((col, i) => (ws.getColumn(i + 1 + TAB_FIRST_COL).width = Math.max(12, col.width + 2)));
    const links: { text: string; to: string; right?: boolean }[] = [{ text: `⌂  ${home}`, to: home }];
    if (month !== null) {
      if (month > 0) links.push({ text: `‹  ${MONTHS[month - 1]}`, to: sheets[si - 1].name, right: true });
      if (month < 11) links.push({ text: `${MONTHS[month + 1]}  ›`, to: sheets[si + 1].name, right: true });
    }
    chrome(ws, lastCol, month !== null ? `${MONTH_NAMES[month]}: ${tab.name}` : first ? spec.title : tab.name, first && month === null ? spec.subtitle : month !== null ? spec.title : spec.subtitle, links);
    const header = ws.getRow(TAB_HEADER_ROW);
    header.height = 30;
    tab.columns.forEach((col, i) => headerCell(header.getCell(i + 1 + TAB_FIRST_COL), col.header, isNumeric(col.type) ? "right" : col.type === "text" ? "left" : "center"));
    const examples = monthExampleRows(tab, month);
    const rows = tabRowCount(tab);
    const firstTyped = tabColLetter(tab.columns.findIndex((x) => !x.formula));
    // Typed number columns whose examples are all whole numbers (e.g. quantities) show no decimals.
    const wholeCols = tab.columns.map((col, i) => !col.formula && tab.exampleRows.every((r) => typeof r[i] !== "number" || Number.isInteger(r[i])));
    for (let k = 0; k < rows; k++) {
      const rowNo = TAB_FIRST_ROW + k;
      const example = examples[k];
      ws.getRow(rowNo).height = 21;
      tab.columns.forEach((col, i) => {
        const c = ws.getCell(rowNo, i + 1 + TAB_FIRST_COL);
        if (col.formula) {
          const f = columnFormula(col.formula, tab, rowNo, spec);
          // Keep empty rows clean: only calculate once the row has something in it.
          c.value = f ? { formula: `IF(${firstTyped}${rowNo}="","",${guardDivide(f)})` } : null;
          c.fill = fill(calc);
          c.font = font({ color: { argb: argb(deep) }, bold: true });
        } else {
          if (example && example[i] !== null && example[i] !== undefined && example[i] !== "") c.value = example[i];
          if (k % 2 === 1 && banded) c.fill = fill(band);
          c.font = font();
        }
        const fmt = numFmt(col.type, spec.currency, wholeCols[i]);
        if (fmt) c.numFmt = fmt;
        c.alignment = alignFor(col.type);
        c.border = rule;
        if (col.type === "checkbox" || col.type === "choice") {
          const place = col.optionsFrom ? listPlace(spec, col.optionsFrom) : null;
          c.dataValidation = { type: "list", allowBlank: true, formulae: [place ? place.range : `"${(col.options ?? ["Yes", "No"]).join(",")}"`] };
        }
      });
    }
    // Colour rules: ticked items go green, percentages get a bar.
    const last = TAB_FIRST_ROW + rows - 1;
    tab.columns.forEach((col, i) => {
      const L = tabColLetter(i);
      const ref = `${L}${TAB_FIRST_ROW}:${L}${last}`;
      if (col.type === "checkbox")
        ws.addConditionalFormatting({
          ref,
          rules: [{ type: "expression", priority: 1, formulae: [`${L}${TAB_FIRST_ROW}="Yes"`], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFE3F1E4" } }, font: { color: { argb: "FF2E7D32" }, bold: true } } }],
        });
      if (col.type === "percent")
        ws.addConditionalFormatting({
          ref,
          rules: [{ type: "dataBar", priority: 2, minLength: 0, maxLength: 100, cfvo: [{ type: "num", value: 0 }, { type: "num", value: 100 }], color: { argb: argb(tint(accent, 0.35)) } } as unknown as ExcelJS.ConditionalFormattingRule],
        });
    });
    // Totals add up money and typed quantities (never worked-out ratios like "months to clear").
    const summable = (col: (typeof tab.columns)[number]) => col.type === "money" || (col.type === "number" && !col.formula);
    if (tab.totals && tab.columns.some(summable)) {
      const tr = last + 1;
      ws.getRow(tr).height = 26;
      tab.columns.forEach((col, i) => {
        const c = ws.getCell(tr, i + 1 + TAB_FIRST_COL);
        if (i === 0) {
          c.value = "Total";
          c.alignment = { vertical: "middle", indent: 1 };
        } else if (summable(col)) {
          const L = tabColLetter(i);
          c.value = { formula: `SUM(${L}${TAB_FIRST_ROW}:${L}${last})` };
          c.numFmt = numFmt(col.type, spec.currency, wholeCols[i]) ?? "General";
          c.alignment = { horizontal: "right", vertical: "middle", indent: 1 };
        }
        c.font = font({ size: 11, bold: true, color: { argb: argb(deep) } });
        c.fill = fill(soft);
        c.border = { top: line(accent, "medium") };
      });
    }
    ws.pageSetup = {
      orientation: n > 5 ? "landscape" : "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
      printTitlesRow: `${TAB_HEADER_ROW}:${TAB_HEADER_ROW}`,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    };
    ws.headerFooter = { oddFooter: `&L&8${spec.title.replace(/&/g, "&&")}&R&8Page &P of &N` };
  }
  return addCharts(await fixInternalLinks((await wb.xlsx.writeBuffer()) as ArrayBuffer), charts);
}

// ───────────── Printable PDF ─────────────
// The same house style on paper: a cover, an overview page, then a page per tab
// with a rounded header bar, airy ruled rows and proper fonts (DM Serif Display
// for titles, Lato for everything else; both free for commercial use, OFL).

const PAGE_SIZES = [
  { name: "A4", w: 595.28, h: 841.89 },
  { name: "USLetter", w: 612, h: 792 },
];

/** The built-in PDF fonts can only draw basic Latin characters (used if the nice fonts can't load). */
const basicSafe = (s: string) =>
  s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/→/g, "->")
    .replace(/·/g, "-")
    .replace(/[^\x20-\x7E£€•]/g, "");
/** Lato covers Latin, punctuation and currency; emoji and the like are dropped. */
const latoSafe = (s: string) => s.replace(/[^ -ɏ‐-‧‰-⁞€™←-↓]/g, "").replace(/\s+/g, " ");

function hexRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

interface PdfFonts {
  serif: PDFFont;
  sans: PDFFont;
  bold: PDFFont;
  safe: (s: string) => string;
}

const fontFiles = new Map<string, Promise<ArrayBuffer | null>>();
/** A font file, fetched once per visit. */
function loadFontFile(name: string) {
  let p = fontFiles.get(name);
  if (!p) {
    p = fetch(`/fonts/${name}`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(name))))
      .catch(() => {
        fontFiles.delete(name); // try again next time
        return null;
      });
    fontFiles.set(name, p);
  }
  return p;
}

/** Keeps only characters every one of the fonts can draw (common look-alikes swapped in first). */
function glyphSafe(fonts: PDFFont[]) {
  const sets = fonts.map((f) => new Set(f.getCharacterSet()));
  const ok = (ch: string) => sets.every((set) => set.has(ch.codePointAt(0)!));
  const swaps: Record<string, string> = { "‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-", "→": "->", "·": "-", "•": "-", "…": "..." };
  return (s: string) =>
    [...latoSafe(s)]
      .map((ch) => (ok(ch) ? ch : [...(swaps[ch] ?? "")].every(ok) ? (swaps[ch] ?? "") : ""))
      .join("");
}

async function embedFonts(pdf: PDFDocument, st: DesignStyle): Promise<PdfFonts> {
  const names = [st.display.file, st.body?.regular ?? "Lato-Regular.ttf", st.body?.bold ?? "Lato-Bold.ttf"];
  const files = await Promise.all(names.map(loadFontFile));
  if (files.every(Boolean)) {
    try {
      pdf.registerFontkit(fontkit);
      const [serif, sans, bold] = await Promise.all(files.map((f) => pdf.embedFont(f!, { subset: true })));
      return { serif, sans, bold, safe: st.id === "classic" ? latoSafe : glyphSafe([serif, sans, bold]) };
    } catch {
      /* fall back below */
    }
  }
  const [serif, sans, bold] = await Promise.all([StandardFonts.TimesRoman, StandardFonts.Helvetica, StandardFonts.HelveticaBold].map((f) => pdf.embedFont(f)));
  return { serif, sans, bold, safe: basicSafe };
}

export async function buildPdf(spec: SheetSpec, size: (typeof PAGE_SIZES)[number], format: ProductFormat = "pdf"): Promise<Uint8Array> {
  // The Excel product's steps talk about tabs, which don't exist on paper.
  const howTo = format === "pdf" ? spec.howTo : [];
  const pdf = await PDFDocument.create();
  const st = styleOf(spec.style);
  const f = await embedFonts(pdf, st);
  /** Titles as the style writes them, and sized to match the classic serif. */
  const tt = (t: string) => (st.display.upper ? t.toUpperCase() : t);
  const dsz = (n: number) => n * (st.display.scale ?? 1);
  pdf.setTitle(f.safe(spec.title));
  pdf.setCreator("BinkSuite");
  const accent = hexRgb(spec.accent);
  const deep = hexRgb(shade(spec.accent, 0.3));
  const soft = hexRgb(tint(spec.accent, 0.88));
  const faint = hexRgb(tint(spec.accent, 0.955));
  const ink = hexRgb(INK);
  const muted = hexRgb(MUTED);
  const ruleC = hexRgb(RULE);
  const colRule = hexRgb(tint(spec.accent, 0.82));
  const dark = hexRgb(shade(spec.accent, 0.4));
  const white = rgb(1, 1, 1);
  const M = 40;
  const pages: PDFPage[] = [];

  const fit = (text: string, font: PDFFont, sz: number, width: number) => {
    let t = f.safe(text);
    while (t.length > 1 && font.widthOfTextAtSize(t, sz) > width) t = t.slice(0, -2).trimEnd() + "…";
    return f.safe(t);
  };
  /** Letter-spaced small caps (drawn glyph by glyph). */
  const spaced = (page: PDFPage, text: string, x: number, y: number, sz: number, font: PDFFont, color: ReturnType<typeof rgb>, track = 1.6, align: "left" | "center" | "right" = "left") => {
    const t = f.safe(text.toUpperCase());
    const width = [...t].reduce((a, ch) => a + font.widthOfTextAtSize(ch, sz) + track, -track);
    let cx = align === "center" ? x - width / 2 : align === "right" ? x - width : x;
    for (const ch of t) {
      page.drawText(ch, { x: cx, y, size: sz, font, color });
      cx += font.widthOfTextAtSize(ch, sz) + track;
    }
    return width;
  };
  /** A rounded rectangle; (x, y) is the bottom-left corner like everything else in pdf-lib. */
  const roundRect = (page: PDFPage, x: number, y: number, w: number, h: number, r: number, o: { color?: ReturnType<typeof rgb>; borderColor?: ReturnType<typeof rgb>; borderWidth?: number }) => {
    const p = `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
    page.drawSvgPath(p, { x, y: y + h, ...o });
  };
  const wrapLines = (text: string, font: PDFFont, sz: number, width: number) => {
    const lines: string[] = [];
    let cur = "";
    for (const word of f.safe(text).split(" ")) {
      const test = cur ? `${cur} ${word}` : word;
      if (font.widthOfTextAtSize(test, sz) > width && cur) {
        lines.push(cur);
        cur = word;
      } else cur = test;
    }
    if (cur) lines.push(cur);
    return lines;
  };
  /** The top of an inner page: small caps product name, a serif title, a rule. Returns the y to continue from. */
  const pageHead = (page: PDFPage, title: string, sub?: string) => {
    const { width, height } = page.getSize();
    const block = st.header === "block";
    if (block) {
      // A dark block across the top with an accent edge.
      page.drawRectangle({ x: 0, y: height - M - (sub ? 66 : 52), width, height: M + (sub ? 66 : 52), color: dark });
      page.drawRectangle({ x: 0, y: height - M - (sub ? 66 : 52) - 4, width, height: 4, color: accent });
    } else if (st.header === "band") page.drawRectangle({ x: 0, y: height - 6, width, height: 6, color: accent });
    const on = block ? white : ink;
    spaced(page, spec.title, M, height - M - 4, 7.5, f.bold, block ? soft : accent, 1.8);
    page.drawText(fit(tt(title), f.serif, dsz(26), width - M * 2 - 150), { x: M, y: height - M - 34, size: dsz(26), font: f.serif, color: st.header === "underline" ? accent : on });
    if (sub) page.drawText(fit(sub, f.sans, 10, width - M * 2 - 150), { x: M, y: height - M - 50, size: 10, font: f.sans, color: block ? soft : muted });
    // A little write-in on the right, the way paper planners do.
    const label = "DATE";
    spaced(page, label, width - M - 120, height - M - 30, 7, f.bold, block ? soft : muted, 1.4);
    page.drawLine({ start: { x: width - M - 92, y: height - M - 31 }, end: { x: width - M, y: height - M - 31 }, thickness: 0.6, color: block ? soft : muted });
    const ruleY = height - M - (sub ? 62 : 46);
    if (block) return ruleY - 30;
    page.drawLine({ start: { x: M, y: ruleY }, end: { x: width - M, y: ruleY }, thickness: st.header === "underline" ? 2.5 : 1, color: accent });
    return ruleY - 16;
  };

  // ── Cover ──
  {
    const page = pdf.addPage([size.w, size.h]);
    pages.push(page);
    const { width: W, height: H } = page.getSize();
    const kicker = format === "excel" ? "Printable companion" : "Printable planner";
    /** Title in up to two lines, from y down; returns the y below it. */
    const coverTitle = (x: number, y: number, maxW: number, align: "left" | "center", colour: ReturnType<typeof rgb>) => {
      let tsz = dsz(46);
      let lines = wrapLines(tt(spec.title), f.serif, tsz, maxW);
      while (lines.length > 2 && tsz > dsz(30)) lines = wrapLines(tt(spec.title), f.serif, (tsz -= 4), maxW);
      lines.slice(0, 2).forEach((l, i) => {
        const tw = f.serif.widthOfTextAtSize(l, tsz);
        page.drawText(l, { x: align === "center" ? x - tw / 2 : x, y: y - i * tsz * 1.1, size: tsz, font: f.serif, color: colour });
      });
      return y - (Math.min(2, lines.length) - 1) * tsz * 1.1 - 34;
    };
    // The small kicker sits clear of the title whatever its size.
    const kickGap = Math.max(40, 40 * (st.display.scale ?? 1));
    const subtitle = (x: number, y: number, maxW: number, align: "left" | "center", colour: ReturnType<typeof rgb>) =>
      wrapLines(spec.subtitle, f.sans, 12, maxW)
        .slice(0, 2)
        .forEach((l, i) => page.drawText(l, { x: align === "center" ? x - f.sans.widthOfTextAtSize(l, 12) / 2 : x, y: y - i * 17, size: 12, font: f.sans, color: colour }));
    if (st.cover === "banner") {
      // A colour block over the top half, the title in white.
      page.drawRectangle({ x: 0, y: H * 0.5, width: W, height: H * 0.5, color: accent });
      page.drawRectangle({ x: 0, y: H * 0.5 - 6, width: W, height: 6, color: dark });
      spaced(page, kicker, W / 2, H * 0.75 + kickGap, 9, f.bold, soft, 2.6, "center");
      const after = coverTitle(W / 2, H * 0.75, W - 120, "center", white);
      page.drawLine({ start: { x: W / 2 - 30, y: after + 12 }, end: { x: W / 2 + 30, y: after + 12 }, thickness: 1.5, color: soft });
      if (spec.subtitle) subtitle(W / 2, after - 12, W - 160, "center", soft);
      page.drawCircle({ x: W / 2, y: H * 0.32, size: 70, color: faint });
      page.drawCircle({ x: W / 2, y: H * 0.32, size: 46, borderColor: accent, borderWidth: 1.2 });
    } else if (st.cover === "left") {
      // A colour strip down the left, words aligned to it.
      page.drawRectangle({ x: 0, y: 0, width: 54, height: H, color: accent });
      page.drawRectangle({ x: 54, y: 0, width: 6, height: H, color: soft });
      page.drawRectangle({ x: W - 150, y: H - 150, width: 150, height: 150, color: faint });
      page.drawRectangle({ x: W - 110, y: H - 110, width: 70, height: 70, color: soft });
      const lx = 100;
      spaced(page, kicker, lx, H * 0.62 + kickGap, 9, f.bold, accent, 2.6);
      const after = coverTitle(lx, H * 0.62, W - lx - 60, "left", ink);
      page.drawRectangle({ x: lx, y: after + 8, width: 60, height: 4, color: accent });
      if (spec.subtitle) subtitle(lx, after - 14, W - lx - 80, "left", muted);
    } else if (st.cover === "bottom") {
      // A soft colour field over the top, the title underneath.
      page.drawRectangle({ x: 0, y: H * 0.48, width: W, height: H * 0.52, color: soft });
      page.drawRectangle({ x: 0, y: H * 0.48, width: W, height: 3, color: accent });
      page.drawCircle({ x: W / 2, y: H * 0.74, size: 90, color: faint });
      page.drawCircle({ x: W / 2, y: H * 0.74, size: 62, borderColor: accent, borderWidth: 1.2 });
      spaced(page, kicker, W / 2, H * 0.36 + kickGap, 9, f.bold, accent, 2.6, "center");
      const after = coverTitle(W / 2, H * 0.36, W - 140, "center", ink);
      if (spec.subtitle) subtitle(W / 2, after - 4, W - 180, "center", muted);
    } else {
      if (st.bg === "dots")
        // A soft dotted field instead of circles and a frame.
        for (let y = H - 40; y > H * 0.7; y -= 16)
          for (let x = 40 + (Math.round(y / 16) % 2) * 8; x < W - 30; x += 16) page.drawCircle({ x, y, size: 1.3, color: soft });
      else {
        // Soft decorative circles.
        page.drawCircle({ x: W - 40, y: H - 60, size: 150, color: soft });
        page.drawCircle({ x: W - 150, y: H - 10, size: 60, color: faint });
        page.drawCircle({ x: 30, y: 90, size: 110, color: faint });
        page.drawRectangle({ x: 22, y: 22, width: W - 44, height: H - 44, borderColor: accent, borderWidth: 0.8 });
      }
      spaced(page, kicker, W / 2, H * 0.6 + kickGap, 9, f.bold, accent, 2.6, "center");
      const after = coverTitle(W / 2, H * 0.6, W - 140, "center", ink);
      page.drawLine({ start: { x: W / 2 - 30, y: after + 12 }, end: { x: W / 2 + 30, y: after + 12 }, thickness: 1.5, color: accent });
      if (spec.subtitle) subtitle(W / 2, after - 12, W - 180, "center", muted);
    }
    // Name and year.
    const by = 130;
    for (const [i, label] of ["Name", "Year"].entries()) {
      const x = (st.cover === "left" ? 270 : W / 2) - 170 + i * 190;
      spaced(page, label, x, by, 8, f.bold, muted, 1.6);
      page.drawLine({ start: { x: x + 44, y: by - 1 }, end: { x: x + 150, y: by - 1 }, thickness: 0.7, color: muted });
    }
  }

  // ── Overview: your numbers (to fill in), how to use ──
  const items = [...spec.inputs.map((i) => i.label), ...spec.summary.map((s) => s.label)];
  if (items.length || howTo.length) {
    const page = pdf.addPage([size.w, size.h]);
    pages.push(page);
    const { width: W } = page.getSize();
    let y = pageHead(page, "Overview", spec.subtitle);
    if (items.length) {
      spaced(page, "Your numbers", M, y - 4, 8.5, f.bold, deep, 1.8);
      y -= 20;
      const colW = (W - M * 2 - 14) / 2;
      items.forEach((label, i) => {
        const x = M + (i % 2) * (colW + 14);
        const top = y - Math.floor(i / 2) * 50;
        roundRect(page, x, top - 40, colW, 40, 8, { color: faint, borderColor: colRule, borderWidth: 0.6 });
        spaced(page, fit(label, f.bold, 7.5, colW - 24), x + 12, top - 14, 7, f.bold, muted, 1.2);
        page.drawLine({ start: { x: x + 12, y: top - 31 }, end: { x: x + colW - 12, y: top - 31 }, thickness: 0.6, color: colRule });
      });
      y -= Math.ceil(items.length / 2) * 50 + 14;
    }
    if (howTo.length) {
      spaced(page, "How to use", M, y - 4, 8.5, f.bold, deep, 1.8);
      y -= 24;
      howTo.forEach((s, i) => {
        page.drawCircle({ x: M + 9, y: y + 3, size: 9, color: accent });
        const n = String(i + 1);
        page.drawText(n, { x: M + 9 - f.bold.widthOfTextAtSize(n, 9) / 2, y: y, size: 9, font: f.bold, color: white });
        const lines = wrapLines(s, f.sans, 10.5, W - M * 2 - 30);
        lines.forEach((l, j) => page.drawText(l, { x: M + 28, y: y - j * 14, size: 10.5, font: f.sans, color: ink }));
        y -= Math.max(1, lines.length) * 14 + 10;
      });
      y -= 8;
    }
    // Notes fill the rest of the page.
    if (y > M + 90) {
      spaced(page, "Notes", M, y - 4, 8.5, f.bold, deep, 1.8);
      for (let ly = y - 28; ly > M + 20; ly -= 22) page.drawLine({ start: { x: M, y: ly }, end: { x: W - M, y: ly }, thickness: 0.5, color: ruleC });
    }
  }

  // ── One page per tab: a ruled table to fill in by hand ──
  for (const { tab, month } of dataSheets(spec)) {
    const landscape = tab.columns.length > 5;
    const [w, h] = landscape ? [size.h, size.w] : [size.w, size.h];
    const page = pdf.addPage([w, h]);
    pages.push(page);
    let y = pageHead(page, month !== null ? MONTH_NAMES[month] : tab.name, month !== null ? tab.name : undefined);
    const total = tab.columns.reduce((a, c) => a + c.width, 0);
    const widths = tab.columns.map((c) => ((w - M * 2) * c.width) / total);
    const headH = 24;
    const rowH = 22;
    // Header: a rounded colour bar, accent words over a rule, or a dark square bar.
    const lined = st.table === "lined";
    const boxed = st.table === "boxed";
    if (lined) page.drawRectangle({ x: M, y: y - headH, width: w - M * 2, height: 2, color: accent });
    else if (boxed) page.drawRectangle({ x: M, y: y - headH, width: w - M * 2, height: headH, color: dark });
    else roundRect(page, M, y - headH, w - M * 2, headH, 6 * st.round, { color: accent });
    let x = M;
    tab.columns.forEach((c, i) => {
      const label = fit(c.header.toUpperCase(), f.bold, 7.5, widths[i] - 12);
      const lw = f.bold.widthOfTextAtSize(label, 7.5);
      const centre = c.type === "checkbox" || c.type === "date" || c.type === "choice";
      page.drawText(label, { x: centre ? x + (widths[i] - lw) / 2 : x + 8, y: y - headH + 9, size: 7.5, font: f.bold, color: lined ? accent : white });
      x += widths[i];
    });
    y -= headH + 2;
    const hasTotal = tab.totals && tab.columns.some((c) => c.type === "money" || (c.type === "number" && !c.formula));
    const rows = Math.floor((y - M - 18 - (hasTotal ? rowH + 8 : 0)) / rowH);
    const tableTop = y;
    for (let k = 0; k < rows; k++) {
      if (k % 2 && st.table === "banded") page.drawRectangle({ x: M, y: y - rowH, width: w - M * 2, height: rowH, color: faint });
      page.drawLine({ start: { x: M, y: y - rowH }, end: { x: w - M, y: y - rowH }, thickness: boxed ? 0.7 : 0.5, color: boxed ? colRule : ruleC });
      x = M;
      tab.columns.forEach((c, i) => {
        if (c.type === "checkbox") roundRect(page, x + widths[i] / 2 - 5, y - rowH / 2 - 5, 10, 10, 2.5, { borderColor: accent, borderWidth: 0.8 });
        x += widths[i];
      });
      y -= rowH;
    }
    // Column guides: faint, none for ruled tables, or a full box.
    x = M;
    if (!lined)
      (boxed ? [0, ...widths] : widths.slice(0, -1)).forEach((cw) => {
        x += cw;
        page.drawLine({ start: { x, y: tableTop }, end: { x, y }, thickness: boxed ? 0.7 : 0.4, color: colRule });
      });
    if (hasTotal) {
      roundRect(page, M, y - rowH - 6, w - M * 2, rowH, 6, { color: soft });
      spaced(page, "Total", M + 10, y - rowH - 6 + 8, 7.5, f.bold, deep, 1.6);
    }
  }

  // Footer on every page but the cover: product name and page number.
  pages.forEach((page, i) => {
    if (i === 0) return;
    const { width } = page.getSize();
    spaced(page, spec.title, M, 22, 6.5, f.sans, muted, 1.4);
    const n = `${i + 1} / ${pages.length}`;
    page.drawText(n, { x: width - M - f.sans.widthOfTextAtSize(n, 7.5), y: 22, size: 7.5, font: f.sans, color: muted });
  });
  return pdf.save();
}

// ───────────── Pack it all up ─────────────

export interface SheetPack {
  zipKey: string;
  files: string[];
  previews: string[];
  screens: { table?: string; dash?: string; page?: string };
  /** The files buyers download (for sending to Etsy). */
  deliverables: Deliverable[];
  bytes: number;
}


export async function buildSheetPack(productId: string, raw: SheetSpec, format: ProductFormat, onProgress: (step: string, fraction: number) => void): Promise<SheetPack> {
  const spec = normaliseSpec(raw);
  const base = slug(spec.title);
  const zip = new JSZip();
  const files: string[] = [];
  // The files buyers download, each also saved on its own for sending to Etsy.
  const buyer: { blob: Blob; ext: string; name: string; type: string }[] = [];
  if (format === "excel") {
    onProgress("Building the Excel workbook…", 0.1);
    const name = `${base}.xlsx`;
    const xlsx = await buildWorkbook(spec);
    zip.file(name, xlsx);
    files.push(name);
    buyer.push({ blob: new Blob([xlsx]), ext: "xlsx", name: buyerFileName(spec.title, "", "xlsx"), type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }
  for (const [i, size] of PAGE_SIZES.entries()) {
    onProgress(`Making the printable PDF (${size.name})…`, 0.25 + i * 0.1);
    const name = `${base}-printable-${size.name}.pdf`;
    const pdf = await buildPdf(spec, size, format);
    zip.file(name, pdf);
    files.push(name);
    buyer.push({ blob: new Blob([pdf as BlobPart]), ext: "pdf", name: buyerFileName(spec.title, `Printable ${size.name === "USLetter" ? "US Letter" : size.name}`, "pdf"), type: "application/pdf" });
  }
  onProgress("Drawing the listing pictures…", 0.5);
  const pictures = await buildListingPhotos(spec, format);
  pictures.listing.forEach((p, i) => {
    const name = `${base}-listing-photo-${i + 1}.jpg`;
    zip.file(name, p);
    files.push(name);
  });
  onProgress("Zipping…", 0.75);
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  onProgress("Uploading…", 0.82);
  const stamp = Date.now().toString(36);
  const zipKey = await uploadProductFile(productId, `${base}-pack-${stamp}.zip`, blob, "application/zip");
  const deliverables: Deliverable[] = [];
  for (const [i, f] of buyer.entries()) deliverables.push({ key: await uploadProductFile(productId, `${base}-file-${i + 1}-${stamp}.${f.ext}`, f.blob, f.type), name: f.name });
  const previews: string[] = [];
  for (const [i, p] of pictures.listing.entries()) previews.push(await uploadProductFile(productId, `${base}-listing-${i + 1}-${stamp}.jpg`, p, "image/jpeg"));
  onProgress("Saving the mockup screens…", 0.94);
  const screens: SheetPack["screens"] = {};
  for (const [k, b] of Object.entries(pictures.screens)) if (b) screens[k as keyof SheetPack["screens"]] = await uploadProductFile(productId, `${base}-screen-${k}-${stamp}.jpg`, b, "image/jpeg");
  onProgress("Done!", 1);
  return { zipKey, files, previews, screens, deliverables, bytes: blob.size };
}
