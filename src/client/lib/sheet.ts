// 📊 The spreadsheet builder. Like the Printer, it runs on YOUR device (free, and far
// too heavy for the Worker): it turns the Analyst's checked design into
//   • an Excel workbook (.xlsx) with real formulas, dropdowns and colours (EXCEL products),
//   • a printable PDF in A4 and US Letter (both EXCEL and PDF products),
//   • two preview pictures for the Etsy listing,
// then zips the files and uploads everything to your storage.
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import JSZip from "jszip";
import { uploadProductFile } from "./files";
import type { ProductFormat } from "../../shared/format";
import { addCharts, type ChartSpec } from "./xlsxCharts";
import { buildListingPhotos } from "./listingPhotos";
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

// ───────────── Pack it all up ─────────────

export interface SheetPack {
  zipKey: string;
  files: string[];
  previews: string[];
  screens: { table?: string; dash?: string; page?: string };
  bytes: number;
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
  const previews: string[] = [];
  for (const [i, p] of pictures.listing.entries()) previews.push(await uploadProductFile(productId, `${base}-listing-${i + 1}-${stamp}.jpg`, p, "image/jpeg"));
  onProgress("Saving the mockup screens…", 0.94);
  const screens: SheetPack["screens"] = {};
  for (const [k, b] of Object.entries(pictures.screens)) if (b) screens[k as keyof SheetPack["screens"]] = await uploadProductFile(productId, `${base}-screen-${k}-${stamp}.jpg`, b, "image/jpeg");
  onProgress("Done!", 1);
  return { zipKey, files, previews, screens, bytes: blob.size };
}
