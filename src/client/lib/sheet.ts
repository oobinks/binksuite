// 📊 The spreadsheet builder. Like the Printer, it runs on YOUR device (free, and far
// too heavy for the Worker): it turns the Analyst's checked design into
//   • an Excel workbook (.xlsx) with real formulas, dropdowns and colours (EXCEL products),
//   • a printable PDF in A4 and US Letter (both EXCEL and PDF products),
//   • two preview pictures for the Etsy listing,
// then zips the files and uploads everything to your storage.
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import JSZip from "jszip";
import { fileUrl } from "./files";
import { loadSloganFont } from "./print";
import type { ProductFormat } from "../../shared/format";
import { addCharts, type ChartSpec } from "./xlsxCharts";
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
  formatValue,
  guardDivide,
  HOW_TO_TAB,
  previewValues,
  SUMMARY_FIRST_ROW,
  SUMMARY_TAB,
  summaryFormula,
  TAB_FIRST_ROW,
  TAB_HEADER_ROW,
  tabRowCount,
  colLetter,
  type ColumnType,
  type SheetSpec,
  type SheetTab,
  type ValueType,
} from "../../shared/sheetSpec";

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "tracker";
const INK = "#3b2f2a";
const CREAM = "#fbf6ee";

/** Mix a colour with white (0 = colour, 1 = white). */
function tint(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => mix(c).toString(16).padStart(2, "0")).join("")}`;
}
const argb = (hex: string) => `FF${hex.slice(1).toUpperCase()}`;

function numFmt(type: ColumnType | ValueType, currency: string): string | undefined {
  if (type === "money") return `"${currency.replace(/"/g, "")}"#,##0.00;[Red]-"${currency.replace(/"/g, "")}"#,##0.00`;
  if (type === "percent") return '0.0"%"';
  if (type === "number") return "#,##0.##";
  if (type === "date") return "dd/mm/yyyy";
  return undefined;
}

// ───────────── Excel ─────────────

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Chart colours: the product's accent first, then a warm, distinct palette. */
export function chartPalette(accent: string) {
  return [accent, "#e9a96b", "#7c9cf5", "#9cb59a", "#e0607e", "#c7a27c", "#6d5bd0", "#f2b35b", "#4f9da6", "#b5838d", "#8a9a5b", "#d4a5a5"];
}

export async function buildWorkbook(spec: SheetSpec): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "BinkSuite";
  wb.created = new Date();
  wb.calcProperties.fullCalcOnLoad = true;
  const accent = spec.accent;
  const soft = tint(accent, 0.85);
  const band = tint(accent, 0.94);
  const thin = { style: "thin" as const, color: { argb: argb(tint(accent, 0.6)) } };
  const box = { top: thin, left: thin, bottom: thin, right: thin };
  const fill = (hex: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: argb(hex) } });
  const headerCell = (c: ExcelJS.Cell, text: string) => {
    c.value = text;
    c.fill = fill(accent);
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    c.border = box;
  };
  const titleRow = (ws: ExcelJS.Worksheet, lastCol: number, title: string, subtitle?: string) => {
    ws.mergeCells(1, 1, 1, Math.max(2, lastCol));
    const t = ws.getCell(1, 1);
    t.value = title;
    t.font = { bold: true, size: 18, color: { argb: argb(accent) } };
    ws.getRow(1).height = 30;
    if (subtitle) {
      ws.mergeCells(2, 1, 2, Math.max(2, lastCol));
      const s = ws.getCell(2, 1);
      s.value = subtitle;
      s.font = { italic: true, color: { argb: argb("#7a5c4d") } };
    }
  };
  const charts: ChartSpec[] = [];
  const palette = chartPalette(accent);
  let sheetCount = 0;
  const addSheet = (name: string, opts?: Partial<ExcelJS.AddWorksheetOptions>) => {
    sheetCount++;
    return wb.addWorksheet(name, opts);
  };

  // How to use (first, so it's what buyers see when they open the file).
  const how = addSheet(HOW_TO_TAB, { properties: { tabColor: { argb: argb(accent) } } });
  how.getColumn(1).width = 4;
  how.getColumn(2).width = 90;
  titleRow(how, 2, spec.title, spec.subtitle);
  let r = 4;
  how.getCell(r++, 2).value = "How to use";
  how.getCell(r - 1, 2).font = { bold: true, size: 13 };
  spec.howTo.forEach((step, i) => {
    const c = how.getCell(r++, 2);
    c.value = `${i + 1}. ${step}`;
    c.alignment = { wrapText: true, vertical: "top" };
  });
  r++;
  const sheets = dataSheets(spec);
  const inside = [
    hasDashboard(spec) ? `${SUMMARY_TAB}: your totals${spec.breakdowns.length + spec.trends.length ? " and charts" : ""}, updated as you type.` : null,
    spec.lists.length ? `${SETTINGS_TAB}: edit your ${spec.lists.map((l) => l.name.toLowerCase()).join(" and ")}; the dropdowns and dashboard follow.` : null,
    ...spec.tabs.map((t) => (t.repeat === "months" ? `Jan to Dec: a ${t.name.toLowerCase()} tab for every month.` : `${t.name}: ${t.columns.map((c) => c.header).join(", ")}.`)),
  ].filter(Boolean) as string[];
  how.getCell(r++, 2).value = `What's inside (${sheets.length + 1 + (hasDashboard(spec) ? 1 : 0) + (spec.lists.length ? 1 : 0)} tabs)`;
  how.getCell(r - 1, 2).font = { bold: true, size: 13 };
  for (const line of inside) how.getCell(r++, 2).value = `• ${line}`;
  r++;
  for (const tip of [
    "White cells are for typing. Shaded cells work themselves out, so there's no need to touch them.",
    "Example entries show how it works. Overwrite or delete them whenever you're ready.",
    "Works in Microsoft Excel, Google Sheets (File → Import) and Apple Numbers.",
  ]) {
    const c = how.getCell(r++, 2);
    c.value = `• ${tip}`;
    c.alignment = { wrapText: true };
    c.font = { color: { argb: argb("#7a5c4d") } };
  }

  // Dashboard: inputs, totals and goals on the left; breakdowns and trends with charts on the right.
  const layout = dashboardLayout(spec);
  if (hasDashboard(spec)) {
    const ws = addSheet(SUMMARY_TAB, { properties: { tabColor: { argb: argb(accent) } }, views: [{ showGridLines: false }] });
    const dashIndex = sheetCount;
    ws.getColumn(1).width = 3;
    ws.getColumn(2).width = 30;
    ws.getColumn(3).width = 16;
    ws.getColumn(4).width = 4;
    ws.getColumn(5).width = 22;
    for (let c = 6; c <= 9; c++) ws.getColumn(c).width = 14;
    titleRow(ws, 12, spec.title, spec.subtitle);
    let row = SUMMARY_FIRST_ROW;
    for (const input of spec.inputs) {
      ws.getCell(row, 2).value = input.label;
      ws.getCell(row, 2).font = { bold: true };
      const c = ws.getCell(row, 3);
      c.value = input.example;
      c.numFmt = numFmt(input.type, spec.currency) ?? "General";
      const edge = { style: "medium" as const, color: { argb: argb(accent) } };
      c.border = { top: edge, left: edge, bottom: edge, right: edge };
      row++;
    }
    if (spec.inputs.length) row++;
    spec.summary.forEach((item, i) => {
      ws.getCell(row, 2).value = item.label;
      ws.getCell(row, 2).font = { bold: true };
      const f = summaryFormula(item.formula, spec, i);
      const c = ws.getCell(row, 3);
      c.value = f ? { formula: guardDivide(f) } : 0;
      c.numFmt = numFmt(item.type, spec.currency) ?? "General";
      c.fill = fill(soft);
      c.font = { bold: true, size: 13 };
      c.border = box;
      row++;
    });
    // Goals: % of target, with a progress bar.
    const cells = summaryCells(spec);
    for (const g of layout.goals) {
      ws.getCell(g.row, 2).value = g.label;
      ws.getCell(g.row, 2).font = { bold: true };
      const cur = cells.items.get(g.current.toLowerCase());
      const tgt = cells.inputs.get(g.target.toLowerCase());
      const c = ws.getCell(g.row, 3);
      c.value = cur && tgt ? { formula: `IFERROR(MIN(100,${cur}/${tgt}*100),0)` } : 0;
      c.numFmt = '0"%"';
      c.font = { bold: true };
      c.border = box;
      ws.addConditionalFormatting({
        ref: `C${g.row}`,
        rules: [{ type: "dataBar", priority: 3, minLength: 0, maxLength: 100, cfvo: [{ type: "num", value: 0 }, { type: "num", value: 100 }], color: { argb: argb(accent) } } as unknown as ExcelJS.ConditionalFormattingRule],
      });
    }
    // Breakdowns and trends.
    for (const b of layout.blocks) {
      const title = ws.getCell(b.titleRow, 5);
      if (b.kind === "breakdown") {
        const bd = spec.breakdowns[b.index];
        const place = listPlace(spec, bd.list)!;
        const sumCol = spec.tabs.find((t) => t.name === bd.tab)!.columns.find((c) => c.header === bd.sum)!;
        title.value = bd.title;
        title.font = { bold: true, size: 13, color: { argb: argb(accent) } };
        headerCell(ws.getCell(b.headerRow, 5), bd.list);
        headerCell(ws.getCell(b.headerRow, 6), bd.sum);
        const by = columnRanges(spec, bd.tab, bd.by)!;
        const sums = columnRanges(spec, bd.tab, bd.sum)!;
        for (let k = 0; k < b.rows; k++) {
          const rr = b.firstRow + k;
          const src = `'${SETTINGS_TAB}'!$${place.col}$${place.first + k}`;
          const label = ws.getCell(rr, 5);
          label.value = { formula: `IF(${src}="","",${src})` };
          label.border = box;
          const v = ws.getCell(rr, 6);
          v.value = { formula: `IF(E${rr}="","",${by.map((rg, i) => `SUMIF(${rg},E${rr},${sums[i]})`).join("+")})` };
          v.numFmt = numFmt(sumCol.type, spec.currency) ?? "General";
          v.border = box;
          if (k % 2) [label, v].forEach((x) => (x.fill = fill(band)));
        }
        const total = b.firstRow + b.rows;
        ws.getCell(total, 5).value = "Total";
        ws.getCell(total, 6).value = { formula: `SUM(F${b.firstRow}:F${total - 1})` };
        ws.getCell(total, 6).numFmt = numFmt(sumCol.type, spec.currency) ?? "General";
        [5, 6].forEach((c) => {
          ws.getCell(total, c).font = { bold: true };
          ws.getCell(total, c).fill = fill(soft);
        });
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
        title.value = tr.title;
        title.font = { bold: true, size: 13, color: { argb: argb(accent) } };
        headerCell(ws.getCell(b.headerRow, 5), "Month");
        tr.series.forEach((col, j) => headerCell(ws.getCell(b.headerRow, 6 + j), col));
        const ranges = tr.series.map((col) => columnRanges(spec, tr.tab, col)!);
        const type = tab.columns.find((c) => c.header === tr.series[0])!.type;
        for (let m = 0; m < 12; m++) {
          const rr = b.firstRow + m;
          ws.getCell(rr, 5).value = MONTHS[m];
          ws.getCell(rr, 5).border = box;
          tr.series.forEach((_, j) => {
            const c = ws.getCell(rr, 6 + j);
            c.value = { formula: `SUM(${ranges[j][m]})` };
            c.numFmt = numFmt(type, spec.currency) ?? "General";
            c.border = box;
            if (m % 2) c.fill = fill(band);
          });
          if (m % 2) ws.getCell(rr, 5).fill = fill(band);
        }
        const total = b.firstRow + 12;
        ws.getCell(total, 5).value = "Year";
        ws.getCell(total, 5).font = { bold: true };
        tr.series.forEach((_, j) => {
          const c = ws.getCell(total, 6 + j);
          const L = colLetter(5 + j);
          c.value = { formula: `SUM(${L}${b.firstRow}:${L}${total - 1})` };
          c.numFmt = numFmt(type, spec.currency) ?? "General";
          c.font = { bold: true };
          c.fill = fill(soft);
        });
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
  }

  // Settings: the lists buyers can edit.
  if (spec.lists.length) {
    const ws = addSheet(SETTINGS_TAB, { properties: { tabColor: { argb: argb(tint(accent, 0.4)) } } });
    titleRow(ws, spec.lists.length * 2, `${SETTINGS_TAB}`, "Rename, add or remove items. Dropdowns and the dashboard update to match.");
    spec.lists.forEach((list, i) => {
      const place = listPlace(spec, list.name)!;
      const col = 2 + i * 2;
      ws.getColumn(col).width = 24;
      ws.getColumn(col - 1).width = i === 0 ? 3 : 4;
      headerCell(ws.getCell(LIST_HEADER_ROW, col), list.name);
      for (let k = 0; k < place.slots; k++) {
        const c = ws.getCell(place.first + k, col);
        c.value = list.items[k] ?? null;
        c.border = box;
        if (k >= list.items.length) c.fill = fill(band);
      }
    });
  }

  // The tabs people fill in (a monthly tab becomes Jan … Dec).
  for (const { name, tab, month } of sheets) {
    const ws = addSheet(name, { views: [{ state: "frozen", ySplit: TAB_HEADER_ROW }], properties: { tabColor: month !== null ? { argb: argb(month % 2 ? tint(accent, 0.45) : tint(accent, 0.25)) } : undefined } });
    const n = tab.columns.length;
    const first = sheets[0].name === name;
    titleRow(ws, n, month !== null ? `${MONTH_NAMES[month]}: ${tab.name}` : first ? spec.title : tab.name, first && month === null ? spec.subtitle : month !== null ? spec.title : undefined);
    const header = ws.getRow(TAB_HEADER_ROW);
    header.height = 24;
    tab.columns.forEach((col, i) => {
      ws.getColumn(i + 1).width = col.width;
      headerCell(header.getCell(i + 1), col.header);
    });
    const examples = monthExampleRows(tab, month);
    const rows = tabRowCount(tab);
    for (let k = 0; k < rows; k++) {
      const rowNo = TAB_FIRST_ROW + k;
      const example = examples[k];
      tab.columns.forEach((col, i) => {
        const c = ws.getCell(rowNo, i + 1);
        if (col.formula) {
          const f = columnFormula(col.formula, tab, rowNo, spec);
          // Keep empty rows clean: only calculate once the row has something in it.
          const firstTyped = colLetter(tab.columns.findIndex((x) => !x.formula));
          c.value = f ? { formula: `IF(${firstTyped}${rowNo}="","",${guardDivide(f)})` } : null;
          c.fill = fill(soft);
        } else {
          if (example && example[i] !== null && example[i] !== undefined && example[i] !== "") c.value = example[i];
          if (k % 2 === 1) c.fill = fill(band);
        }
        const fmt = numFmt(col.type, spec.currency);
        if (fmt) c.numFmt = fmt;
        c.border = box;
        if (col.type === "checkbox" || col.type === "choice") {
          const place = col.optionsFrom ? listPlace(spec, col.optionsFrom) : null;
          c.dataValidation = { type: "list", allowBlank: true, formulae: [place ? place.range : `"${(col.options ?? ["Yes", "No"]).join(",")}"`] };
          c.alignment = { horizontal: "center" };
        }
      });
    }
    // Colour rules: ticked rows go green, percentages get a bar.
    const last = TAB_FIRST_ROW + rows - 1;
    tab.columns.forEach((col, i) => {
      const L = colLetter(i);
      const ref = `${L}${TAB_FIRST_ROW}:${L}${last}`;
      if (col.type === "checkbox")
        ws.addConditionalFormatting({ ref, rules: [{ type: "expression", priority: 1, formulae: [`${L}${TAB_FIRST_ROW}="Yes"`], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFC8E6C9" } } } }] });
      if (col.type === "percent")
        ws.addConditionalFormatting({
          ref,
          rules: [{ type: "dataBar", priority: 2, minLength: 0, maxLength: 100, cfvo: [{ type: "num", value: 0 }, { type: "num", value: 100 }], color: { argb: argb(accent) } } as unknown as ExcelJS.ConditionalFormattingRule],
        });
    });
    if (tab.totals && tab.columns.some((c) => c.type === "money" || c.type === "number")) {
      const tr = last + 1;
      ws.getCell(tr, 1).value = "Total";
      tab.columns.forEach((col, i) => {
        const c = ws.getCell(tr, i + 1);
        if (i > 0 && (col.type === "money" || col.type === "number")) {
          c.value = { formula: `SUM(${colLetter(i)}${TAB_FIRST_ROW}:${colLetter(i)}${last})` };
          c.numFmt = numFmt(col.type, spec.currency) ?? "General";
        }
        c.font = { bold: true };
        c.fill = fill(soft);
        c.border = { top: { style: "double", color: { argb: argb(accent) } } };
      });
    }
    ws.pageSetup = { orientation: n > 5 ? "landscape" : "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  }
  return addCharts((await wb.xlsx.writeBuffer()) as ArrayBuffer, charts);
}

// ───────────── Printable PDF ─────────────

const PAGE_SIZES = [
  { name: "A4", w: 595.28, h: 841.89 },
  { name: "USLetter", w: 612, h: 792 },
];

/** Helvetica can only draw basic Latin characters (plus £ and €). */
const pdfSafe = (s: string) =>
  s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/→/g, "->")
    .replace(/[^\x20-\x7E£€•]/g, "");

function hexRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function fit(text: string, font: PDFFont, size: number, width: number) {
  let t = pdfSafe(text);
  while (t.length > 1 && font.widthOfTextAtSize(t, size) > width) t = t.slice(0, -2) + ".";
  return t;
}

export async function buildPdf(spec: SheetSpec, size: (typeof PAGE_SIZES)[number], format: ProductFormat = "pdf"): Promise<Uint8Array> {
  // The Excel product's steps talk about tabs, which don't exist on paper.
  const howTo = format === "pdf" ? spec.howTo : [];
  const pdf = await PDFDocument.create();
  pdf.setTitle(pdfSafe(spec.title));
  pdf.setCreator("BinkSuite");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const accent = hexRgb(spec.accent);
  const soft = hexRgb(tint(spec.accent, 0.88));
  const ink = hexRgb(INK);
  const line = hexRgb(tint(spec.accent, 0.55));
  const M = 36;

  const heading = (page: PDFPage, title: string, sub?: string) => {
    const { width, height } = page.getSize();
    page.drawRectangle({ x: 0, y: height - 10, width, height: 10, color: accent });
    page.drawText(fit(title, bold, 22, width - M * 2), { x: M, y: height - M - 20, size: 22, font: bold, color: accent });
    if (sub) page.drawText(fit(sub, font, 11, width - M * 2), { x: M, y: height - M - 38, size: 11, font, color: ink });
    return height - M - (sub ? 58 : 40);
  };

  // Overview page: the inputs and summary as boxes to fill in, plus how to use.
  if (spec.inputs.length || spec.summary.length || howTo.length) {
    const page = pdf.addPage([size.w, size.h]);
    let y = heading(page, spec.title, spec.subtitle);
    const boxW = size.w - M * 2;
    for (const item of [...spec.inputs.map((i) => i.label), ...spec.summary.map((s) => s.label)]) {
      page.drawRectangle({ x: M, y: y - 34, width: boxW, height: 30, color: soft, borderColor: line, borderWidth: 1 });
      page.drawText(fit(item, bold, 12, boxW * 0.55), { x: M + 10, y: y - 23, size: 12, font: bold, color: ink });
      page.drawLine({ start: { x: M + boxW * 0.6, y: y - 25 }, end: { x: M + boxW - 12, y: y - 25 }, thickness: 0.8, color: ink });
      y -= 40;
    }
    if (howTo.length) {
      y -= 16;
      page.drawText("How to use", { x: M, y, size: 13, font: bold, color: accent });
      y -= 18;
      howTo.forEach((s, i) => {
        page.drawText(fit(`${i + 1}. ${s}`, font, 10.5, boxW), { x: M, y, size: 10.5, font, color: ink });
        y -= 15;
      });
    }
  }

  // One page per tab: a ruled table to fill in by hand.
  for (const { tab, month } of dataSheets(spec)) {
    const landscape = tab.columns.length > 5;
    const [w, h] = landscape ? [size.h, size.w] : [size.w, size.h];
    const page = pdf.addPage([w, h]);
    const first = tab.name === spec.tabs[0].name && (month === null || month === 0);
    let y = heading(page, month !== null ? `${MONTH_NAMES[month]}: ${tab.name}` : first ? spec.title : tab.name, first ? spec.subtitle : month !== null ? spec.title : undefined);
    const total = tab.columns.reduce((a, c) => a + c.width, 0);
    const widths = tab.columns.map((c) => ((w - M * 2) * c.width) / total);
    const rowH = 22;
    // Header.
    let x = M;
    tab.columns.forEach((c, i) => {
      page.drawRectangle({ x, y: y - rowH, width: widths[i], height: rowH, color: accent });
      page.drawText(fit(c.header, bold, 9.5, widths[i] - 8), { x: x + 4, y: y - rowH + 7, size: 9.5, font: bold, color: rgb(1, 1, 1) });
      x += widths[i];
    });
    y -= rowH;
    const rows = Math.floor((y - M - (tab.totals ? rowH : 0)) / rowH);
    for (let k = 0; k < rows; k++) {
      x = M;
      tab.columns.forEach((c, i) => {
        page.drawRectangle({ x, y: y - rowH, width: widths[i], height: rowH, color: k % 2 ? soft : undefined, borderColor: line, borderWidth: 0.6 });
        if (c.type === "checkbox") page.drawRectangle({ x: x + widths[i] / 2 - 5, y: y - rowH + 6, width: 10, height: 10, borderColor: ink, borderWidth: 0.8 });
        x += widths[i];
      });
      y -= rowH;
    }
    if (tab.totals && tab.columns.some((c) => c.type === "money" || c.type === "number")) {
      page.drawRectangle({ x: M, y: y - rowH, width: w - M * 2, height: rowH, color: soft, borderColor: accent, borderWidth: 1 });
      page.drawText("Total", { x: M + 4, y: y - rowH + 7, size: 10, font: bold, color: ink });
    }
  }
  return pdf.save();
}

// ───────────── Preview pictures for the listing ─────────────

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!] as const;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function clip(ctx: CanvasRenderingContext2D, text: string, max: number) {
  let t = text;
  while (t.length > 1 && ctx.measureText(t).width > max) t = t.slice(0, -2) + "…";
  return t;
}

/** Draw a spreadsheet-looking table of a tab (with example values) into a box. */
function drawTable(
  ctx: CanvasRenderingContext2D,
  spec: SheetSpec,
  tab: SheetTab,
  rows: (string | number | null)[][],
  x: number,
  y: number,
  w: number,
  h: number,
  blank = false,
  fixedRowH?: number,
) {
  const total = tab.columns.reduce((a, c) => a + c.width, 0);
  const widths = tab.columns.map((c) => (w * c.width) / total);
  const rowH = fixedRowH ?? Math.min(64, h / (Math.max(rows.length, 6) + 2));
  const font = Math.round(rowH * 0.42);
  let cx = x;
  ctx.textBaseline = "middle";
  tab.columns.forEach((c, i) => {
    ctx.fillStyle = spec.accent;
    ctx.fillRect(cx, y, widths[i], rowH);
    ctx.fillStyle = "#fff";
    ctx.font = `800 ${font}px Nunito, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(clip(ctx, c.header, widths[i] - 12), cx + widths[i] / 2, y + rowH / 2);
    cx += widths[i];
  });
  const count = Math.floor((h - rowH) / rowH);
  for (let k = 0; k < count; k++) {
    const ry = y + rowH * (k + 1);
    cx = x;
    tab.columns.forEach((c, i) => {
      ctx.fillStyle = c.formula ? tint(spec.accent, 0.85) : k % 2 ? tint(spec.accent, 0.94) : "#fff";
      ctx.fillRect(cx, ry, widths[i], rowH);
      ctx.strokeStyle = tint(spec.accent, 0.6);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(cx, ry, widths[i], rowH);
      const v = blank ? "" : rows[k]?.[i];
      if (c.type === "checkbox") {
        const s = rowH * 0.45;
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2;
        ctx.strokeRect(cx + widths[i] / 2 - s / 2, ry + rowH / 2 - s / 2, s, s);
        if (v === "Yes") {
          ctx.fillStyle = "#2e7d32";
          ctx.font = `900 ${font}px Nunito, sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText("✓", cx + widths[i] / 2, ry + rowH / 2);
        }
      } else if (v !== null && v !== undefined && v !== "") {
        const text = formatValue(v, c.type, spec.currency);
        const numeric = c.type === "money" || c.type === "number" || c.type === "percent";
        ctx.fillStyle = c.type === "money" && typeof v === "number" && v < 0 ? "#c62828" : INK;
        ctx.font = `${c.formula ? 800 : 600} ${font}px Nunito, sans-serif`;
        ctx.textAlign = numeric ? "right" : "left";
        ctx.fillText(clip(ctx, text, widths[i] - 16), numeric ? cx + widths[i] - 10 : cx + 10, ry + rowH / 2);
      }
      cx += widths[i];
    });
  }
  return { widths, rowH, rows: count };
}

function backdrop(ctx: CanvasRenderingContext2D, w: number, h: number, accent: string) {
  ctx.fillStyle = CREAM;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = tint(accent, 0.8);
  ctx.beginPath();
  ctx.arc(w * 0.08, h * 0.1, h * 0.35, 0, Math.PI * 2);
  ctx.arc(w * 0.95, h * 0.95, h * 0.4, 0, Math.PI * 2);
  ctx.fill();
}

function titleBlock(ctx: CanvasRenderingContext2D, spec: SheetSpec, w: number, badge: string) {
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = INK;
  ctx.font = "900 96px Nunito, sans-serif";
  ctx.fillText(clip(ctx, spec.title, w - 160), w / 2, 150);
  ctx.fillStyle = "#7a5c4d";
  ctx.font = "700 44px Nunito, sans-serif";
  ctx.fillText(clip(ctx, spec.subtitle || badge, w - 200), w / 2, 215);
  // Badge.
  ctx.font = "900 34px Nunito, sans-serif";
  const bw = ctx.measureText(badge).width + 60;
  ctx.fillStyle = spec.accent;
  roundRect(ctx, w / 2 - bw / 2, 245, bw, 60, 30);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "middle";
  ctx.fillText(badge, w / 2, 276);
}

function toJpeg(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't make the preview picture"))), "image/jpeg", 0.9));
}

/** Small rounded label, e.g. "Google Sheets". Returns its width. */
function pill(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, bg: string, fg = "#fff", size = 34) {
  ctx.font = `900 ${size}px Nunito, sans-serif`;
  const w = ctx.measureText(text).width + size * 1.4;
  ctx.fillStyle = bg;
  roundRect(ctx, x, y, w, size * 1.7, size * 0.85);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + size * 0.7, y + size * 0.86);
  return w;
}

function card(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 28) {
  ctx.save();
  ctx.shadowColor = "rgba(59,47,42,.2)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 14;
  ctx.fillStyle = "#fff";
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.restore();
}

/** A headline at the top of a listing picture. */
function headline(ctx: CanvasRenderingContext2D, text: string, sub: string, W: number) {
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = INK;
  ctx.font = "900 92px Nunito, sans-serif";
  ctx.fillText(clip(ctx, text, W - 160), W / 2, 140);
  ctx.fillStyle = "#7a5c4d";
  ctx.font = "700 44px Nunito, sans-serif";
  ctx.fillText(clip(ctx, sub, W - 200), W / 2, 205);
}

/** A curved arrow from a callout bubble to a point. */
function arrow(ctx: CanvasRenderingContext2D, from: [number, number], to: [number, number], colour: string) {
  const [x1, y1] = from;
  const [x2, y2] = to;
  const cx = (x1 + x2) / 2 + (y2 - y1) * 0.25;
  const cy = (y1 + y2) / 2 - (x2 - x1) * 0.25;
  ctx.strokeStyle = colour;
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.quadraticCurveTo(cx, cy, x2, y2);
  ctx.stroke();
  const a = Math.atan2(y2 - cy, x2 - cx);
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - 34 * Math.cos(a - 0.45), y2 - 34 * Math.sin(a - 0.45));
  ctx.lineTo(x2 - 34 * Math.cos(a + 0.45), y2 - 34 * Math.sin(a + 0.45));
  ctx.closePath();
  ctx.fill();
}

function bubble(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, colour: string) {
  ctx.font = "900 44px Nunito, sans-serif";
  const w = ctx.measureText(text).width + 70;
  const h = 92;
  ctx.save();
  ctx.shadowColor = "rgba(59,47,42,.25)";
  ctx.shadowBlur = 24;
  ctx.fillStyle = colour;
  roundRect(ctx, x - w / 2, y - h / 2, w, h, 46);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y + 2);
  return { w, h };
}

type Values = ReturnType<typeof previewValues>;
type ChartPic = { kind: "doughnut" | "bars"; title: string; type: ColumnType; items: { label: string; value: number }[] };

/** The chart on the dashboard picture: the first breakdown (doughnut), else the first trend, else the first tab's examples. */
function chartData(spec: SheetSpec, values: Values): ChartPic | null {
  const typeOf = (tab: string, col: string) => spec.tabs.find((t) => t.name === tab)?.columns.find((c) => c.header === col)?.type ?? "money";
  const b = values.breakdowns[0];
  const slices = b?.items.filter((i) => i.value > 0) ?? [];
  if (b && slices.length >= 2) return { kind: "doughnut", title: b.title, type: typeOf(b.tab, b.sum), items: slices };
  const t = values.trends[0];
  if (t) return { kind: "bars", title: `${t.title} (${t.series[0]})`, type: typeOf(t.tab, t.series[0]), items: t.months.map((m) => ({ label: m.month, value: m.values[0] })) };
  const rows = values.tabs[0].rows;
  const tab = spec.tabs[0];
  const label = tab.columns.findIndex((c) => c.type === "text");
  const money = tab.columns.findIndex((c) => (c.type === "money" || c.type === "number") && rows.some((r) => typeof r[tab.columns.indexOf(c)] === "number"));
  if (label < 0 || money < 0) return null;
  const items = rows.filter((r) => r[label] && typeof r[money] === "number").map((r) => ({ label: String(r[label]), value: Number(r[money]) }));
  return items.length >= 2 ? { kind: "bars", title: tab.columns[money].header, type: tab.columns[money].type, items: items.slice(0, 6) } : null;
}

/** A doughnut with a legend, like the Excel chart. */
function drawDoughnut(ctx: CanvasRenderingContext2D, spec: SheetSpec, data: ChartPic, x: number, y: number, w: number, h: number) {
  const total = data.items.reduce((a, i) => a + i.value, 0) || 1;
  const colours = chartPalette(spec.accent);
  const r = Math.min(w * 0.3, h * 0.45);
  const cx = x + r + 20;
  const cy = y + h / 2;
  let a = -Math.PI / 2;
  data.items.forEach((item, i) => {
    const sweep = (item.value / total) * Math.PI * 2;
    ctx.fillStyle = colours[i % colours.length];
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, a, a + sweep);
    ctx.closePath();
    ctx.fill();
    a += sweep;
  });
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.58, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `900 ${Math.round(r * 0.22)}px Nunito, sans-serif`;
  ctx.fillText(formatValue(total, data.type, spec.currency), cx, cy);
  const lx = cx + r + 50;
  const rowH = Math.min(52, (h - 20) / data.items.length);
  data.items.slice(0, 12).forEach((item, i) => {
    const ly = y + 20 + i * rowH;
    ctx.fillStyle = colours[i % colours.length];
    roundRect(ctx, lx, ly, 26, 26, 6);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.textAlign = "left";
    ctx.font = `700 ${Math.round(rowH * 0.55)}px Nunito, sans-serif`;
    ctx.fillText(clip(ctx, `${item.label} · ${Math.round((item.value / total) * 100)}%`, x + w - lx - 40), lx + 40, ly + 14);
  });
}

function drawBars(ctx: CanvasRenderingContext2D, spec: SheetSpec, data: ChartPic, x: number, y: number, w: number, h: number) {
  const max = Math.max(...data.items.map((i) => Math.abs(i.value)), 1);
  const rowH = Math.min(110, h / data.items.length);
  const labelW = w * 0.28;
  data.items.forEach((item, i) => {
    const by = y + i * rowH;
    ctx.fillStyle = INK;
    ctx.font = "800 40px Nunito, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(clip(ctx, item.label, labelW - 20), x + labelW - 20, by + rowH / 2);
    const bw = ((w - labelW - 220) * Math.abs(item.value)) / max;
    ctx.fillStyle = i % 2 ? tint(spec.accent, 0.35) : spec.accent;
    roundRect(ctx, x + labelW, by + rowH * 0.18, Math.max(bw, 12), rowH * 0.64, 14);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.textAlign = "left";
    ctx.fillText(formatValue(item.value, data.type, spec.currency), x + labelW + bw + 18, by + rowH / 2);
  });
}

/** A spreadsheet "window" as the laptop screen shows it: toolbar, column letters, the table, tab strip. */
function drawScreen(spec: SheetSpec, rows: (string | number | null)[][], format: ProductFormat) {
  const W = 1600;
  const H = 1000;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = format === "excel" ? "#1f7a4d" : spec.accent;
  ctx.fillRect(0, 0, W, 70);
  ctx.fillStyle = "#fff";
  ctx.font = "800 34px Nunito, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(clip(ctx, `${spec.title}${format === "excel" ? ".xlsx" : ".pdf"}`, W - 80), 30, 36);
  ctx.fillStyle = "#f3f3f3";
  ctx.fillRect(0, 70, W, 56);
  ctx.fillStyle = "#666";
  ctx.font = "700 26px Nunito, sans-serif";
  ["File", "Edit", "View", "Insert", "Format", "Data"].forEach((m, i) => ctx.fillText(m, 30 + i * 110, 98));
  // Title row, as in the workbook.
  ctx.fillStyle = spec.accent;
  ctx.font = "900 46px Nunito, sans-serif";
  ctx.fillText(clip(ctx, spec.title, W - 80), 40, 175);
  drawTable(ctx, spec, spec.tabs[0], rows, 40, 220, W - 80, H - 320, format === "pdf", 52);
  // Sheet tabs.
  ctx.fillStyle = "#f3f3f3";
  ctx.fillRect(0, H - 70, W, 70);
  let tx = 30;
  const names = [HOW_TO_TAB, ...(hasDashboard(spec) ? [SUMMARY_TAB] : []), ...(spec.lists.length ? [SETTINGS_TAB] : []), ...dataSheets(spec).map((d) => d.name)];
  names.forEach((n, i) => {
    ctx.font = "800 26px Nunito, sans-serif";
    const w = ctx.measureText(n).width + 40;
    ctx.fillStyle = i === names.length - spec.tabs.length ? "#fff" : "#e4e4e4";
    roundRect(ctx, tx, H - 60, w, 50, 8);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.fillText(n, tx + 20, H - 35);
    tx += w + 10;
  });
  return c;
}

/** The dashboard as a tall tablet screen: summary cards and the chart. */
function drawDashScreen(spec: SheetSpec, values: ReturnType<typeof previewValues>) {
  const W = 1200;
  const H = 1600;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = CREAM;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = spec.accent;
  ctx.fillRect(0, 0, W, 190);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = "900 64px Nunito, sans-serif";
  ctx.fillText(clip(ctx, spec.title, W - 100), 50, 110);
  ctx.font = "700 32px Nunito, sans-serif";
  ctx.fillText(clip(ctx, spec.subtitle || SUMMARY_TAB, W - 100), 50, 160);
  const items = [
    ...spec.inputs.map((i) => ({ label: i.label, value: formatValue(i.example, i.type, spec.currency) })),
    ...values.summary.map((s) => ({ label: s.label, value: formatValue(s.value, s.type, spec.currency) })),
  ].slice(0, 6);
  items.forEach((it, i) => {
    const x = 50 + (i % 2) * 560;
    const y = 240 + Math.floor(i / 2) * 210;
    card(ctx, x, y, 540, 180, 24);
    ctx.fillStyle = spec.accent;
    roundRect(ctx, x, y, 14, 180, 7);
    ctx.fill();
    ctx.fillStyle = "#7a5c4d";
    ctx.font = "800 32px Nunito, sans-serif";
    ctx.fillText(clip(ctx, it.label, 480), x + 40, y + 62);
    ctx.fillStyle = INK;
    ctx.font = "900 62px Nunito, sans-serif";
    ctx.fillText(clip(ctx, it.value, 480), x + 40, y + 145);
  });
  const chart = chartData(spec, values);
  if (chart) {
    const top = 240 + Math.ceil(items.length / 2) * 210 + 30;
    card(ctx, 50, top, W - 100, H - top - 60, 24);
    ctx.fillStyle = INK;
    ctx.font = "900 40px Nunito, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(clip(ctx, chart.title, W - 180), 90, top + 70);
    if (chart.kind === "doughnut") drawDoughnut(ctx, spec, chart, 80, top + 100, W - 160, H - top - 200);
    else drawBars(ctx, spec, chart, 80, top + 110, W - 160, H - top - 220);
  }
  return c;
}

/** A printed A4 page: title band, the table to fill in, tick boxes. */
function drawPage(spec: SheetSpec, format: ProductFormat, rows: (string | number | null)[][]) {
  const W = 1240;
  const H = 1754;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = spec.accent;
  ctx.fillRect(0, 0, W, 22);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = "900 70px Nunito, sans-serif";
  ctx.fillText(clip(ctx, spec.title, W - 140), 70, 140);
  ctx.fillStyle = "#7a5c4d";
  ctx.font = "700 32px Nunito, sans-serif";
  ctx.fillText(clip(ctx, spec.subtitle, W - 140), 70, 190);
  // Handwriting-style example rows only on Excel's printed copy; PDF pages stay blank to fill in.
  drawTable(ctx, spec, spec.tabs[0], format === "excel" ? rows : [], 70, 240, W - 140, H - 320, format === "pdf", 50);
  return c;
}

export interface SheetPictures {
  /** Listing photos, in order. */
  listing: Blob[];
  /** Screens for the photo mockups. */
  screens: { table: Blob; dash?: Blob; page: Blob };
}

export async function buildPreviews(spec: SheetSpec, format: ProductFormat): Promise<SheetPictures> {
  await loadSloganFont();
  const W = 2000;
  const H = 1500;
  const values = previewValues(spec);
  const rows = values.tabs[0].rows;
  const tab = spec.tabs[0];
  const excel = format === "excel";
  const screen = drawScreen(spec, rows, format);
  const page = drawPage(spec, format, rows);
  const dash = excel && (spec.inputs.length || spec.summary.length) ? drawDashScreen(spec, values) : null;
  const listing: Blob[] = [];

  // 1. Hero: the product on a laptop (Excel) or a fanned pair of pages (PDF), with what you get.
  {
    const [c, ctx] = canvas(W, H);
    backdrop(ctx, W, H, spec.accent);
    titleBlock(ctx, spec, W, excel ? "EXCEL + GOOGLE SHEETS" : "PRINTABLE PDF");
    if (excel) {
      const lw = 1240;
      const lh = lw * 0.62;
      const lx = 150;
      const ly = 380;
      ctx.save();
      ctx.shadowColor = "rgba(30,20,10,.35)";
      ctx.shadowBlur = 50;
      ctx.shadowOffsetY = 24;
      ctx.fillStyle = "#1d1d1f";
      roundRect(ctx, lx, ly, lw, lh, 26);
      ctx.fill();
      ctx.restore();
      ctx.drawImage(screen, lx + 26, ly + 26, lw - 52, lh - 60);
      ctx.fillStyle = "#c9c9cf";
      ctx.beginPath();
      ctx.moveTo(lx - 80, ly + lh);
      ctx.lineTo(lx + lw + 80, ly + lh);
      ctx.lineTo(lx + lw + 50, ly + lh + 36);
      ctx.lineTo(lx - 50, ly + lh + 36);
      ctx.fill();
      if (dash) {
        const pw = 420;
        const ph = pw * 2;
        const px = W - pw - 170;
        const py = H - ph - 60;
        ctx.save();
        ctx.shadowColor = "rgba(30,20,10,.35)";
        ctx.shadowBlur = 50;
        ctx.fillStyle = "#1d1d1f";
        roundRect(ctx, px, py, pw, ph, 56);
        ctx.fill();
        ctx.restore();
        ctx.save();
        roundRect(ctx, px + 18, py + 18, pw - 36, ph - 36, 40);
        ctx.clip();
        ctx.drawImage(dash, 0, 0, dash.width, dash.width * ((ph - 36) / (pw - 36)), px + 18, py + 18, pw - 36, ph - 36);
        ctx.restore();
      }
    } else {
      const ph = 1000;
      const pw = ph / 1.414;
      [-7, 5].forEach((deg, i) => {
        ctx.save();
        ctx.translate(W / 2 + (i ? 170 : -170), 380 + ph / 2);
        ctx.rotate((deg * Math.PI) / 180);
        ctx.shadowColor = "rgba(30,20,10,.3)";
        ctx.shadowBlur = 40;
        ctx.shadowOffsetY = 20;
        ctx.drawImage(page, -pw / 2, -ph / 2, pw, ph);
        ctx.restore();
      });
    }
    let px = 120;
    for (const t of excel ? ["Excel", "Google Sheets", "Printable PDF", "Instant download"] : ["A4 + US Letter", "Print at home", "Instant download"]) {
      px += pill(ctx, t, px, H - 110, INK, "#fff", 32) + 20;
    }
    listing.push(await toJpeg(c));
  }

  // 2. Feature callouts on the table.
  {
    const [c, ctx] = canvas(W, H);
    backdrop(ctx, W, H, spec.accent);
    headline(ctx, excel ? "It does the maths for you" : "Made to fill in by hand", excel ? "Type in the white cells, everything else works itself out" : "Print it, grab a pen, done", W);
    const x = 150;
    const y = 470;
    const w = W - 300;
    card(ctx, x - 30, y - 30, w + 60, 760);
    const g = drawTable(ctx, spec, tab, rows, x, y, w, 700, !excel, 76);
    const colX = (i: number) => x + g.widths.slice(0, i).reduce((a, b) => a + b, 0) + g.widths[i] / 2;
    const formulaCol = tab.columns.findIndex((col) => col.formula);
    const pickCol = tab.columns.findIndex((col) => col.type === "checkbox" || col.type === "choice");
    const callouts: { text: string; at: [number, number]; from: [number, number] }[] = [];
    if (excel && formulaCol >= 0) callouts.push({ text: "Works itself out", at: [colX(formulaCol), y + g.rowH * 1.5], from: [colX(formulaCol), 330] });
    if (pickCol >= 0)
      callouts.push({
        text: tab.columns[pickCol].type === "checkbox" ? (excel ? "Tick off as you go" : "Tick boxes") : "Handy dropdowns",
        at: [colX(pickCol), y + g.rowH * 2.5],
        from: [Math.min(W - 300, colX(pickCol) + 120), 1380],
      });
    callouts.push({ text: excel ? "Plenty of rows, totals update" : "Plenty of room to write", at: [x + g.widths[0] / 2, y + g.rowH * 5.5], from: [420, 1380] });
    callouts.forEach((co, i) => {
      const colour = i === 1 ? "#2e7d32" : spec.accent;
      arrow(ctx, [co.from[0], co.from[1] + (co.from[1] < co.at[1] ? 46 : -46)], co.at, colour);
      bubble(ctx, co.text, co.from[0], co.from[1], colour);
    });
    listing.push(await toJpeg(c));
  }

  // 3. Dashboard with a chart (Excel), or a close-up of the printed page (PDF).
  if (dash) {
    const [c, ctx] = canvas(W, H);
    backdrop(ctx, W, H, spec.accent);
    headline(ctx, "Everything at a glance", "Your summary updates as you type", W);
    const ch = 1180;
    const cw = ch * (dash.width / dash.height);
    card(ctx, 140, 270, cw, ch, 30);
    ctx.save();
    roundRect(ctx, 140, 270, cw, ch, 30);
    ctx.clip();
    ctx.drawImage(dash, 140, 270, cw, ch);
    ctx.restore();
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    const notes = [
      spec.inputs.length ? `Type your ${spec.inputs[0].label.toLowerCase()} once` : "Fill in your rows",
      `${spec.summary.length} totals worked out for you`,
      chartData(spec, values) ? "See where it all goes" : "Colour-coded as you go",
      "Works in Excel & Google Sheets",
    ];
    notes.forEach((n, i) => {
      const ny = 420 + i * 230;
      ctx.fillStyle = spec.accent;
      ctx.beginPath();
      ctx.arc(cw + 260, ny - 16, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "900 40px Nunito, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(i + 1), cw + 260, ny - 2);
      ctx.fillStyle = INK;
      ctx.font = "800 46px Nunito, sans-serif";
      ctx.textAlign = "left";
      wrapText(ctx, n, cw + 320, ny, W - cw - 420, 56);
    });
    listing.push(await toJpeg(c));
  }

  // 4. What's inside: every tab (or page) as a card.
  {
    const [c, ctx] = canvas(W, H);
    backdrop(ctx, W, H, spec.accent);
    headline(ctx, "What's inside", excel ? "One file, everything set up" : "Every page, ready to print", W);
    const parts = [
      ...(excel ? [{ name: HOW_TO_TAB, note: `${spec.howTo.length} simple steps` }] : []),
      ...(spec.inputs.length || spec.summary.length ? [{ name: excel ? SUMMARY_TAB : "Overview page", note: `${spec.inputs.length + spec.summary.length} boxes` }] : []),
      ...spec.tabs.map((t) => ({ name: t.name, note: t.repeat === "months" ? "12 monthly tabs, Jan to Dec" : t.columns.map((col) => col.header).slice(0, 4).join(" · ") })),
      ...(excel ? [{ name: "Printable PDF", note: "A4 + US Letter" }] : [{ name: "Two paper sizes", note: "A4 + US Letter" }]),
    ].slice(0, 6);
    const cols = parts.length > 4 ? 3 : 2;
    const cw = (W - 240 - (cols - 1) * 50) / cols;
    const chh = parts.length > cols ? 480 : 700;
    parts.forEach((part, i) => {
      const x = 120 + (i % cols) * (cw + 50);
      const y = 290 + Math.floor(i / cols) * (chh + 50);
      card(ctx, x, y, cw, chh);
      ctx.fillStyle = spec.accent;
      roundRect(ctx, x, y, cw, 90, 28);
      ctx.fill();
      ctx.fillRect(x, y + 50, cw, 40);
      ctx.fillStyle = "#fff";
      ctx.font = "900 44px Nunito, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(clip(ctx, part.name, cw - 60), x + 30, y + 47);
      const t = spec.tabs.find((tt) => tt.name === part.name);
      if (t) drawTable(ctx, spec, t, values.tabs[spec.tabs.indexOf(t)].rows, x + 24, y + 116, cw - 48, chh - 220, !excel, 40);
      else {
        ctx.fillStyle = tint(spec.accent, 0.9);
        roundRect(ctx, x + 24, y + 116, cw - 48, chh - 220, 18);
        ctx.fill();
        ctx.fillStyle = spec.accent;
        ctx.font = "900 120px Nunito, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(part.name === HOW_TO_TAB ? "?" : part.name.includes("PDF") || part.name.includes("sizes") ? "A4" : "£", x + cw / 2, y + 116 + (chh - 220) / 2);
      }
      ctx.fillStyle = "#7a5c4d";
      ctx.font = "800 34px Nunito, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(clip(ctx, part.note, cw - 60), x + 30, y + chh - 52);
    });
    listing.push(await toJpeg(c));
  }

  // 5. The printed page.
  {
    const [c, ctx] = canvas(W, H);
    backdrop(ctx, W, H, spec.accent);
    headline(ctx, excel ? "Prefer paper? Print it" : "Print as many as you like", "A4 and US Letter included", W);
    const ph = 1180;
    const pw = ph / 1.414;
    ctx.save();
    ctx.translate(W / 2, 270 + ph / 2);
    ctx.rotate((-3 * Math.PI) / 180);
    ctx.shadowColor = "rgba(30,20,10,.3)";
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 20;
    ctx.drawImage(page, -pw / 2, -ph / 2, pw, ph);
    ctx.restore();
    listing.push(await toJpeg(c));
  }

  return { listing, screens: { table: await toJpeg(screen), dash: dash ? await toJpeg(dash) : undefined, page: await toJpeg(page) } };
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, lineH: number) {
  let line = "";
  let yy = y;
  for (const word of text.split(" ")) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > max && line) {
      ctx.fillText(line, x, yy);
      line = word;
      yy += lineH;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, yy);
}

// ───────────── Pack it all up ─────────────

export interface SheetPack {
  zipKey: string;
  files: string[];
  previews: string[];
  screens: { table?: string; dash?: string; page?: string };
  bytes: number;
}

async function upload(productId: string, name: string, body: Blob, type: string): Promise<string> {
  const res = await fetch(fileUrl(`products/${productId}/${name}`), { method: "PUT", credentials: "same-origin", headers: { "content-type": type }, body });
  if (!res.ok) {
    const msg = await res.json().catch(() => null);
    throw new Error(msg?.error ?? `Upload failed (${res.status})`);
  }
  return ((await res.json()) as { key: string }).key;
}

export async function buildSheetPack(productId: string, raw: SheetSpec, format: ProductFormat, onProgress: (step: string, fraction: number) => void): Promise<SheetPack> {
  const spec = normaliseSpec(raw);
  const base = slug(spec.title);
  const zip = new JSZip();
  const files: string[] = [];
  if (format === "excel") {
    onProgress("Building the Excel workbook…", 0.1);
    const name = `${base}.xlsx`;
    zip.file(name, await buildWorkbook(spec));
    files.push(name);
  }
  for (const [i, size] of PAGE_SIZES.entries()) {
    onProgress(`Making the printable PDF (${size.name})…`, 0.25 + i * 0.1);
    const name = `${base}-printable-${size.name}.pdf`;
    zip.file(name, await buildPdf(spec, size, format));
    files.push(name);
  }
  onProgress("Drawing the listing pictures…", 0.5);
  const pictures = await buildPreviews(spec, format);
  pictures.listing.forEach((p, i) => {
    const name = `${base}-listing-photo-${i + 1}.jpg`;
    zip.file(name, p);
    files.push(name);
  });
  onProgress("Zipping…", 0.75);
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  onProgress("Uploading…", 0.82);
  const stamp = Date.now().toString(36);
  const zipKey = await upload(productId, `${base}-pack-${stamp}.zip`, blob, "application/zip");
  const previews: string[] = [];
  for (const [i, p] of pictures.listing.entries()) previews.push(await upload(productId, `${base}-listing-${i + 1}-${stamp}.jpg`, p, "image/jpeg"));
  onProgress("Saving the mockup screens…", 0.94);
  const screens: SheetPack["screens"] = {};
  for (const [k, b] of Object.entries(pictures.screens)) if (b) screens[k as keyof SheetPack["screens"]] = await upload(productId, `${base}-screen-${k}-${stamp}.jpg`, b, "image/jpeg");
  onProgress("Done!", 1);
  return { zipKey, files, previews, screens, bytes: blob.size };
}
