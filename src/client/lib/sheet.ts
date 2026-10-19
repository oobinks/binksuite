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
import {
  columnFormula,
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

  // How to use (first, so it's what buyers see when they open the file).
  const how = wb.addWorksheet(HOW_TO_TAB, { properties: { tabColor: { argb: argb(accent) } } });
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
  for (const tip of [
    "White cells are for typing. Shaded cells work themselves out, so there's no need to touch them.",
    "Works in Microsoft Excel, Google Sheets (File → Import) and Apple Numbers.",
    "Delete the example rows whenever you're ready. Totals update as you type.",
  ]) {
    const c = how.getCell(r++, 2);
    c.value = `• ${tip}`;
    c.alignment = { wrapText: true };
    c.font = { color: { argb: argb("#7a5c4d") } };
  }

  // Summary dashboard: inputs you type once, then the totals.
  if (spec.inputs.length || spec.summary.length) {
    const ws = wb.addWorksheet(SUMMARY_TAB, { properties: { tabColor: { argb: argb(accent) } } });
    ws.getColumn(1).width = 3;
    ws.getColumn(2).width = 34;
    ws.getColumn(3).width = 18;
    ws.getColumn(4).width = 26;
    titleRow(ws, 4, spec.title, spec.subtitle);
    let row = SUMMARY_FIRST_ROW;
    for (const input of spec.inputs) {
      ws.getCell(row, 2).value = input.label;
      ws.getCell(row, 2).font = { bold: true };
      const c = ws.getCell(row, 3);
      c.value = input.example;
      c.numFmt = numFmt(input.type, spec.currency) ?? "General";
      c.border = { top: { style: "medium", color: { argb: argb(accent) } }, left: { style: "medium", color: { argb: argb(accent) } }, bottom: { style: "medium", color: { argb: argb(accent) } }, right: { style: "medium", color: { argb: argb(accent) } } };
      ws.getCell(row, 4).value = "← type yours here";
      ws.getCell(row, 4).font = { italic: true, color: { argb: argb("#7a5c4d") } };
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
  }

  // The tabs people fill in.
  for (const tab of spec.tabs) {
    const ws = wb.addWorksheet(tab.name, { views: [{ state: "frozen", ySplit: TAB_HEADER_ROW }] });
    const n = tab.columns.length;
    titleRow(ws, n, tab.name === spec.tabs[0].name ? spec.title : tab.name, tab.name === spec.tabs[0].name ? spec.subtitle : undefined);
    const header = ws.getRow(TAB_HEADER_ROW);
    header.height = 24;
    tab.columns.forEach((col, i) => {
      ws.getColumn(i + 1).width = col.width;
      const h = header.getCell(i + 1);
      h.value = col.header;
      h.fill = fill(accent);
      h.font = { bold: true, color: { argb: "FFFFFFFF" } };
      h.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      h.border = box;
    });
    const rows = tabRowCount(tab);
    for (let k = 0; k < rows; k++) {
      const rowNo = TAB_FIRST_ROW + k;
      const example = tab.exampleRows[k];
      tab.columns.forEach((col, i) => {
        const c = ws.getCell(rowNo, i + 1);
        if (col.formula) {
          const f = columnFormula(col.formula, tab, rowNo, spec);
          // Keep empty rows clean: only calculate once the row has something in it.
          const first = colLetter(tab.columns.findIndex((x) => !x.formula));
          c.value = f ? { formula: `IF(${first}${rowNo}="","",${guardDivide(f)})` } : null;
          c.fill = fill(soft);
        } else {
          if (example && example[i] !== null && example[i] !== undefined) c.value = example[i];
          if (k % 2 === 1) c.fill = fill(band);
        }
        const fmt = numFmt(col.type, spec.currency);
        if (fmt) c.numFmt = fmt;
        c.border = box;
        if (col.type === "checkbox" || col.type === "choice") {
          c.dataValidation = { type: "list", allowBlank: true, formulae: [`"${(col.options ?? ["Yes", "No"]).join(",")}"`] };
          c.alignment = { horizontal: "center" };
        }
      });
    }
    // Colour rules: ticked rows go green, negative money goes red, percentages get a bar.
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
    // Totals row.
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
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
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
  for (const tab of spec.tabs) {
    const landscape = tab.columns.length > 5;
    const [w, h] = landscape ? [size.h, size.w] : [size.w, size.h];
    const page = pdf.addPage([w, h]);
    let y = heading(page, tab.name === spec.tabs[0].name ? spec.title : tab.name, tab.name === spec.tabs[0].name ? spec.subtitle : undefined);
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
function drawTable(ctx: CanvasRenderingContext2D, spec: SheetSpec, tab: SheetTab, rows: (string | number | null)[][], x: number, y: number, w: number, h: number, blank = false) {
  const total = tab.columns.reduce((a, c) => a + c.width, 0);
  const widths = tab.columns.map((c) => (w * c.width) / total);
  const rowH = Math.min(64, h / (Math.max(rows.length, 6) + 2));
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

export async function buildPreviews(spec: SheetSpec, format: ProductFormat): Promise<Blob[]> {
  await loadSloganFont();
  const W = 2000;
  const H = 1500;
  const values = previewValues(spec);
  const out: Blob[] = [];
  const tab = spec.tabs[0];

  // 1. Hero: the main tab, filled with the examples.
  {
    const [c, ctx] = canvas(W, H);
    backdrop(ctx, W, H, spec.accent);
    titleBlock(ctx, spec, W, format === "excel" ? "EXCEL + GOOGLE SHEETS" : "PRINTABLE PDF");
    const x = 120;
    const y = 360;
    ctx.fillStyle = "#fff";
    ctx.shadowColor = "rgba(59,47,42,.25)";
    ctx.shadowBlur = 40;
    roundRect(ctx, x - 20, y - 20, W - x * 2 + 40, H - y - 80, 24);
    ctx.fill();
    ctx.shadowBlur = 0;
    drawTable(ctx, spec, tab, values.tabs[0].rows, x, y, W - x * 2, H - y - 120, format === "pdf");
    out.push(await toJpeg(c));
  }

  // 2. Dashboard (Excel) or the printed page (PDF), plus what's included.
  {
    const [c, ctx] = canvas(W, H);
    backdrop(ctx, W, H, spec.accent);
    titleBlock(ctx, spec, W, format === "excel" ? "FORMULAS DO THE MATHS" : "PRINT & FILL IN");
    const cards =
      format === "excel" && values.summary.length
        ? values.summary.slice(0, 6).map((s) => ({ label: s.label, value: formatValue(s.value, s.type, spec.currency) }))
        : [...spec.inputs.map((i) => i.label), ...spec.summary.map((s) => s.label)].slice(0, 6).map((l) => ({ label: l, value: "" }));
    const cols = 3;
    const cw = (W - 240 - (cols - 1) * 40) / cols;
    cards.forEach((card, i) => {
      const cx = 120 + (i % cols) * (cw + 40);
      const cy = 380 + Math.floor(i / cols) * 230;
      ctx.fillStyle = "#fff";
      ctx.shadowColor = "rgba(59,47,42,.18)";
      ctx.shadowBlur = 30;
      roundRect(ctx, cx, cy, cw, 190, 28);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = spec.accent;
      roundRect(ctx, cx, cy, 16, 190, 8);
      ctx.fill();
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#7a5c4d";
      ctx.font = "800 38px Nunito, sans-serif";
      ctx.fillText(clip(ctx, card.label, cw - 70), cx + 46, cy + 70);
      ctx.fillStyle = INK;
      ctx.font = "900 70px Nunito, sans-serif";
      if (card.value) ctx.fillText(clip(ctx, card.value, cw - 70), cx + 46, cy + 155);
      else {
        ctx.strokeStyle = INK;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx + 46, cy + 150);
        ctx.lineTo(cx + cw - 40, cy + 150);
        ctx.stroke();
      }
    });
    const included =
      format === "excel"
        ? ["✓ Excel file with working formulas", "✓ Opens in Google Sheets & Numbers", "✓ Printable PDF (A4 + US Letter)", "✓ Instant download"]
        : ["✓ Printable PDF", "✓ A4 + US Letter sizes", "✓ Print as many as you like", "✓ Instant download"];
    const top = 380 + Math.ceil(Math.max(1, cards.length) / cols) * 230 + 40;
    ctx.fillStyle = "#fff";
    roundRect(ctx, 120, top, W - 240, H - top - 90, 28);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.font = "800 46px Nunito, sans-serif";
    ctx.textBaseline = "middle";
    included.forEach((t, i) => {
      ctx.textAlign = "left";
      ctx.fillText(t, 180 + (i % 2) * ((W - 240) / 2), top + (H - top - 90) * (i < 2 ? 0.3 : 0.7));
    });
    out.push(await toJpeg(c));
  }
  return out;
}

// ───────────── Pack it all up ─────────────

export interface SheetPack {
  zipKey: string;
  files: string[];
  previews: string[];
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

export async function buildSheetPack(productId: string, spec: SheetSpec, format: ProductFormat, onProgress: (step: string, fraction: number) => void): Promise<SheetPack> {
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
    onProgress(`Making the printable PDF (${size.name})…`, 0.3 + i * 0.15);
    const name = `${base}-printable-${size.name}.pdf`;
    zip.file(name, await buildPdf(spec, size, format));
    files.push(name);
  }
  onProgress("Drawing the listing pictures…", 0.65);
  const pictures = await buildPreviews(spec, format);
  pictures.forEach((p, i) => {
    const name = `${base}-preview-${i + 1}.jpg`;
    zip.file(name, p);
    files.push(name);
  });
  onProgress("Zipping…", 0.8);
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  onProgress("Uploading…", 0.88);
  const stamp = Date.now().toString(36);
  const zipKey = await upload(productId, `${base}-pack-${stamp}.zip`, blob, "application/zip");
  const previews: string[] = [];
  for (const [i, p] of pictures.entries()) previews.push(await upload(productId, `${base}-preview-${i + 1}-${stamp}.jpg`, p, "image/jpeg"));
  onProgress("Done!", 1);
  return { zipKey, files, previews, bytes: blob.size };
}
