// 📸 The listing photo studio. Every spreadsheet / printable product gets a full,
// consistent photo set in one BinkSuite brand template (like the best-selling
// Etsy template shops): a cover with devices, badges and a feature bar, then
// "what's inside", the dashboard, feature slides, "works everywhere", "how it
// works" and the printable PDF. Drawn on your device, 2000 × 1500 px.
import { loadSloganFont } from "./print";
import type { ProductFormat } from "../../shared/format";
import { STYLES, styleOf, type DesignStyle } from "../../shared/designStyles";
import { loadStyleFonts } from "./styleFonts";
import {
  dataSheets,
  formatValue,
  hasDashboard,
  HOW_TO_TAB,
  marketingFor,
  pageCount,
  previewValues,
  SETTINGS_TAB,
  SUMMARY_TAB,
  tabCount,
  type ColumnType,
  type SheetSpec,
  type SheetTab,
} from "../../shared/sheetSpec";

export const PHOTO_W = 2000;
export const PHOTO_H = 1500;
const INK = "#2f2724";
const MUTED = "#7a6a60";
export const SERIF = '"DM Serif Display", Georgia, serif';
const SANS = "Nunito, sans-serif";
const EXCEL_GREEN = "#1f7a4d";

// The design style being drawn (see shared/designStyles.ts). Set for one photo set at
// a time by buildListingPhotos, then put back to the classic look for other photo sets.
let ST: DesignStyle = STYLES.classic;
let DISPLAY = SERIF;
let BODY = SANS;

/** Use a style's fonts and layout for the drawing that follows. */
export function useStyle(s: DesignStyle) {
  ST = s;
  DISPLAY = s.id === "classic" ? SERIF : `"BS ${s.id} display", ${SERIF}`;
  BODY = s.body ? `"BS ${s.id} body", ${SANS}` : SANS;
}

/** Title text as the style writes it (some styles are all capitals, letter-spaced). */
function disp(ctx: CanvasRenderingContext2D, text: string) {
  ctx.letterSpacing = `${ST.display.tracking}px`;
  return ST.display.upper ? text.toUpperCase() : text;
}
const undisp = (ctx: CanvasRenderingContext2D) => (ctx.letterSpacing = "0px");
/** Titles in condensed or wide fonts are drawn a little bigger or smaller to match. */
const dsz = (n: number) => Math.round(n * (ST.display.scale ?? 1));

/** Mix a colour with black (0 = colour, 1 = black). */
function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c * (1 - amount));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => mix(c).toString(16).padStart(2, "0")).join("")}`;
}

type Values = ReturnType<typeof previewValues>;
type Row = (string | number | null)[];

// ───────────── Drawing kit ─────────────

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  return [c, ctx] as const;
}

export function tint(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => mix(c).toString(16).padStart(2, "0")).join("")}`;
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function clip(ctx: CanvasRenderingContext2D, text: string, max: number) {
  let t = text;
  while (t.length > 1 && ctx.measureText(t).width > max) t = t.slice(0, -2) + "…";
  return t;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, lineH: number, maxLines = 3) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > max && line) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  if (line) lines.push(line);
  lines.slice(0, maxLines).forEach((l, i) => ctx.fillText(l, x, y + i * lineH));
  return Math.min(lines.length, maxLines) * lineH;
}

function shadowed(ctx: CanvasRenderingContext2D, blur: number, dy: number, alpha: number, draw: () => void) {
  ctx.save();
  ctx.shadowColor = `rgba(40,30,20,${alpha})`;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetY = dy;
  draw();
  ctx.restore();
}

function toJpeg(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't make a listing photo"))), "image/jpeg", 0.92));
}

export async function loadPhotoFonts() {
  await loadSloganFont();
  try {
    await loadStyleFonts(ST);
    await Promise.all([document.fonts.load(`400 80px ${DISPLAY}`), document.fonts.load(`800 40px ${BODY}`), document.fonts.load(`700 40px ${BODY}`)]);
  } catch {
    /* falls back to system fonts */
  }
}

export function chartColours(accent: string) {
  return [accent, "#e9a96b", "#7c9cf5", "#9cb59a", "#e0607e", "#c7a27c", "#6d5bd0", "#f2b35b", "#4f9da6", "#b5838d", "#8a9a5b", "#d4a5a5"];
}

const num = (v: unknown) => (typeof v === "number" ? v : Number(String(v ?? "").replace(/[^0-9.-]/g, "")) || 0);

// ───────────── Spreadsheet "screenshots" ─────────────

type View = { kind: "dashboard" } | { kind: "settings" } | { kind: "howto" } | { kind: "tab"; tab: number; month: number | null };

/** Where the eye-catching parts of a dashboard shot are (shot pixels), for callouts. */
export interface ShotAnchors {
  totals?: [number, number];
  goal?: [number, number];
  chart?: [number, number];
}

/** A table as the workbook draws it: accent header, banded rows, shaded calculated columns, tick boxes. */
function drawGrid(ctx: CanvasRenderingContext2D, spec: SheetSpec, tab: SheetTab, rows: Row[], x: number, y: number, w: number, rowH: number, count: number, blank = false) {
  const total = tab.columns.reduce((a, c) => a + c.width, 0);
  const widths = tab.columns.map((c) => (w * c.width) / total);
  const font = Math.round(rowH * 0.42);
  ctx.textBaseline = "middle";
  let cx = x;
  const lined = ST.table === "lined";
  const boxed = ST.table === "boxed";
  tab.columns.forEach((c, i) => {
    // Header: a colour bar, accent words over a thick rule, or a dark boxed bar.
    ctx.fillStyle = lined ? "#fff" : boxed ? shade(spec.accent, 0.35) : spec.accent;
    ctx.fillRect(cx, y, widths[i], rowH);
    if (lined) {
      ctx.fillStyle = spec.accent;
      ctx.fillRect(cx, y + rowH - 4, widths[i], 4);
    }
    ctx.fillStyle = lined ? spec.accent : "#fff";
    ctx.font = `800 ${font}px ${BODY}`;
    ctx.textAlign = "center";
    ctx.fillText(clip(ctx, c.header, widths[i] - 10), cx + widths[i] / 2, y + rowH / 2);
    cx += widths[i];
  });
  for (let k = 0; k < count; k++) {
    const ry = y + rowH * (k + 1);
    cx = x;
    tab.columns.forEach((c, i) => {
      ctx.fillStyle = c.formula ? tint(spec.accent, lined ? 0.92 : 0.85) : k % 2 && ST.table === "banded" ? tint(spec.accent, 0.94) : "#fff";
      ctx.fillRect(cx, ry, widths[i], rowH);
      if (lined) {
        ctx.fillStyle = tint(spec.accent, 0.75);
        ctx.fillRect(cx, ry + rowH - 1, widths[i], 1);
      } else {
        ctx.strokeStyle = tint(spec.accent, boxed ? 0.45 : 0.65);
        ctx.lineWidth = boxed ? 1.5 : 1;
        ctx.strokeRect(cx + 0.5, ry + 0.5, widths[i], rowH);
      }
      const v = blank ? null : rows[k]?.[i];
      if (c.type === "checkbox") {
        const s = rowH * 0.42;
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.6;
        ctx.strokeRect(cx + widths[i] / 2 - s / 2, ry + rowH / 2 - s / 2, s, s);
        if (v === "Yes") {
          ctx.strokeStyle = "#2e7d32";
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(cx + widths[i] / 2 - s * 0.3, ry + rowH / 2);
          ctx.lineTo(cx + widths[i] / 2 - s * 0.05, ry + rowH / 2 + s * 0.25);
          ctx.lineTo(cx + widths[i] / 2 + s * 0.35, ry + rowH / 2 - s * 0.3);
          ctx.stroke();
        }
      } else if (v !== null && v !== undefined && v !== "") {
        const numeric = c.type === "money" || c.type === "number" || c.type === "percent";
        ctx.fillStyle = c.type === "money" && num(v) < 0 ? "#c62828" : INK;
        ctx.font = `${c.formula ? 800 : 600} ${font}px ${BODY}`;
        ctx.textAlign = numeric ? "right" : "left";
        ctx.fillText(clip(ctx, formatValue(v, c.type, spec.currency), widths[i] - 12), numeric ? cx + widths[i] - 8 : cx + 8, ry + rowH / 2);
        if (c.type === "choice") {
          ctx.fillStyle = MUTED;
          ctx.textAlign = "right";
          ctx.font = `700 ${Math.round(font * 0.7)}px ${BODY}`;
          ctx.fillText("▾", cx + widths[i] - 6, ry + rowH / 2);
        }
      }
      cx += widths[i];
    });
  }
  return { widths, bottom: y + rowH * (count + 1) };
}

function drawDonut(ctx: CanvasRenderingContext2D, spec: SheetSpec, items: { label: string; value: number }[], cx: number, cy: number, r: number, type: ColumnType, legendX?: number, legendSize = 22) {
  const total = items.reduce((a, i) => a + Math.max(0, i.value), 0) || 1;
  const colours = chartColours(spec.accent);
  let a = -Math.PI / 2;
  items.forEach((it, i) => {
    const sweep = (Math.max(0, it.value) / total) * Math.PI * 2;
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
  ctx.font = `900 ${Math.round(r * 0.2)}px ${BODY}`;
  ctx.fillText(formatValue(total, type, spec.currency), cx, cy);
  if (legendX !== undefined) {
    items.slice(0, 10).forEach((it, i) => {
      const ly = cy - r + i * legendSize * 1.5;
      ctx.fillStyle = colours[i % colours.length];
      rr(ctx, legendX, ly, legendSize * 0.8, legendSize * 0.8, 4);
      ctx.fill();
      ctx.fillStyle = INK;
      ctx.textAlign = "left";
      ctx.font = `700 ${legendSize}px ${BODY}`;
      ctx.fillText(`${it.label} · ${Math.round((Math.max(0, it.value) / total) * 100)}%`, legendX + legendSize * 1.2, ly + legendSize * 0.42);
    });
  }
}

function drawColumns(ctx: CanvasRenderingContext2D, spec: SheetSpec, months: { month: string; values: number[] }[], x: number, y: number, w: number, h: number) {
  const max = Math.max(...months.flatMap((m) => m.values.map(Math.abs)), 1);
  const colours = chartColours(spec.accent);
  const slot = w / months.length;
  const series = months[0]?.values.length ?? 1;
  const bw = (slot * 0.7) / series;
  ctx.strokeStyle = "#e7e2da";
  ctx.lineWidth = 1;
  for (let g = 0; g <= 4; g++) {
    ctx.beginPath();
    ctx.moveTo(x, y + (h * g) / 4);
    ctx.lineTo(x + w, y + (h * g) / 4);
    ctx.stroke();
  }
  months.forEach((m, i) => {
    m.values.forEach((v, j) => {
      const bh = (Math.abs(v) / max) * h;
      ctx.fillStyle = colours[j % colours.length];
      rr(ctx, x + i * slot + slot * 0.15 + j * bw, y + h - bh, bw - 2, bh, 3);
      ctx.fill();
    });
    ctx.fillStyle = MUTED;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = `700 ${Math.round(Math.min(18, slot * 0.35))}px ${BODY}`;
    ctx.fillText(m.month, x + i * slot + slot / 2, y + h + 6);
  });
}

/** A screenshot-like view of one sheet of the workbook, with the app window and tab strip. */
export function renderSheetShot(spec: SheetSpec, values: Values, view: View, format: ProductFormat, w = 1600, h = 1000): HTMLCanvasElement & { anchors?: ShotAnchors } {
  const [c, ctx] = canvas(w, h);
  const anchors: ShotAnchors = {};
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  // Window chrome.
  const bar = 58;
  ctx.fillStyle = format === "excel" ? EXCEL_GREEN : spec.accent;
  ctx.fillRect(0, 0, w, bar);
  ctx.fillStyle = "#fff";
  ctx.font = `800 26px ${BODY}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(clip(ctx, `${spec.title}.${format === "excel" ? "xlsx" : "pdf"}`, w - 60), 26, bar / 2);
  ctx.fillStyle = "#f3f2f1";
  ctx.fillRect(0, bar, w, 40);
  ctx.fillStyle = "#605e5c";
  ctx.font = `700 20px ${BODY}`;
  ["File", "Home", "Insert", "Formulas", "Data", "View"].forEach((m, i) => ctx.fillText(m, 26 + i * 100, bar + 20));
  // Column letters + row gutter.
  const top = bar + 40;
  ctx.fillStyle = "#f6f6f6";
  ctx.fillRect(0, top, w, 26);
  ctx.fillRect(0, top, 34, h - top);
  ctx.fillStyle = "#9a9a9a";
  ctx.font = `700 15px ${BODY}`;
  ctx.textAlign = "center";
  for (let i = 0; i < 14; i++) ctx.fillText(String.fromCharCode(65 + i), 34 + 60 + i * 120, top + 13);
  const x0 = 60;
  const y0 = top + 46;
  const cw = w - x0 - 40;

  // The workbook's title band and subtitle strip, as the buyer sees them.
  const title = (t: string, sub?: string) => {
    const under = ST.header === "underline";
    // A colour band, an accent title over a thick rule, or a dark block with an accent edge.
    ctx.fillStyle = under ? "#fff" : ST.header === "block" ? shade(spec.accent, 0.4) : spec.accent;
    ctx.fillRect(x0, y0 - 6, cw, 52);
    if (ST.header === "block") {
      ctx.fillStyle = spec.accent;
      ctx.fillRect(x0, y0 - 6, 10, 52);
    }
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = under ? spec.accent : "#fff";
    ctx.font = `400 ${dsz(32)}px ${DISPLAY}`;
    const tt = disp(ctx, t);
    ctx.fillText(clip(ctx, tt, cw - 40), x0 + (under ? 2 : 22), y0 + 21);
    undisp(ctx);
    ctx.fillStyle = under ? spec.accent : tint(spec.accent, 0.88);
    if (under) ctx.fillRect(x0, y0 + 46, cw, 4);
    else ctx.fillRect(x0, y0 + 46, cw, 26);
    if (sub) {
      ctx.fillStyle = under ? MUTED : spec.accent;
      ctx.font = `italic 600 16px ${BODY}`;
      ctx.fillText(clip(ctx, sub, cw - 40), x0 + (under ? 2 : 18), y0 + (under ? 66 : 59));
    }
    ctx.textBaseline = "alphabetic";
  };

  const sheets = [HOW_TO_TAB, ...(hasDashboard(spec) ? [SUMMARY_TAB] : []), ...(spec.lists.length ? [SETTINGS_TAB] : []), ...dataSheets(spec).map((d) => d.name)];
  let active = HOW_TO_TAB;

  if (view.kind === "dashboard") {
    active = SUMMARY_TAB;
    title(spec.title, spec.subtitle);
    let y = y0 + 90;
    const rowH = 40;
    const lw = cw * 0.24;
    const vw = cw * 0.13;
    const cell = (label: string, value: string, shaded: boolean, edge = false) => {
      ctx.fillStyle = INK;
      ctx.font = `800 18px ${BODY}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(clip(ctx, label, lw - 10), x0, y + rowH / 2);
      ctx.fillStyle = shaded ? tint(spec.accent, 0.85) : "#fff";
      ctx.fillRect(x0 + lw, y + 4, vw, rowH - 8);
      ctx.strokeStyle = edge ? spec.accent : tint(spec.accent, 0.6);
      ctx.lineWidth = edge ? 2.5 : 1;
      ctx.strokeRect(x0 + lw, y + 4, vw, rowH - 8);
      ctx.fillStyle = INK;
      ctx.font = `900 19px ${BODY}`;
      ctx.textAlign = "right";
      ctx.fillText(clip(ctx, value, vw - 10), x0 + lw + vw - 8, y + rowH / 2);
      y += rowH;
    };
    spec.inputs.forEach((i) => cell(i.label, formatValue(i.example, i.type, spec.currency), false, true));
    if (spec.inputs.length) y += 14;
    if (values.summary.length) anchors.totals = [x0 + lw - 10, y + (rowH * Math.min(3, values.summary.length)) / 2];
    values.summary.forEach((s) => cell(s.label, formatValue(s.value, s.type, spec.currency), true));
    if (values.summary.length) y += 14;
    if (values.goals.length) anchors.goal = [x0 + lw - 10, y + rowH / 2];
    for (const g of values.goals) {
      ctx.fillStyle = INK;
      ctx.font = `800 18px ${BODY}`;
      ctx.textAlign = "left";
      ctx.fillText(clip(ctx, g.label, lw - 10), x0, y + rowH / 2);
      ctx.fillStyle = "#eee";
      ctx.fillRect(x0 + lw, y + 8, vw, rowH - 16);
      ctx.fillStyle = spec.accent;
      ctx.fillRect(x0 + lw, y + 8, (vw * Math.min(100, g.value)) / 100, rowH - 16);
      ctx.fillStyle = INK;
      ctx.textAlign = "right";
      ctx.font = `900 17px ${BODY}`;
      ctx.fillText(`${Math.min(100, Math.round(g.value))}%`, x0 + lw + vw - 6, y + rowH / 2);
      y += rowH;
    }
    // Right side: the first breakdown (table + doughnut) and the first trend (columns).
    const rx = x0 + lw + vw + 40;
    const rw = w - rx - 40;
    let ry = y0 + 90;
    const b = values.breakdowns[0];
    if (b) {
      const type = spec.tabs.find((t) => t.name === b.tab)?.columns.find((col) => col.header === b.sum)?.type ?? "money";
      ctx.fillStyle = spec.accent;
      ctx.font = `900 22px ${BODY}`;
      ctx.textAlign = "left";
      ctx.fillText(b.title, rx, ry);
      ry += 16;
      const tw = rw * 0.38;
      ctx.fillStyle = spec.accent;
      ctx.fillRect(rx, ry, tw, 30);
      ctx.fillStyle = "#fff";
      ctx.font = `800 15px ${BODY}`;
      ctx.fillText(b.list, rx + 8, ry + 15);
      ctx.textAlign = "right";
      ctx.fillText(b.sum, rx + tw - 8, ry + 15);
      b.items.slice(0, 9).forEach((it, k) => {
        const yy = ry + 30 + k * 28;
        ctx.fillStyle = k % 2 ? tint(spec.accent, 0.94) : "#fff";
        ctx.fillRect(rx, yy, tw, 28);
        ctx.strokeStyle = tint(spec.accent, 0.7);
        ctx.strokeRect(rx, yy, tw, 28);
        ctx.fillStyle = INK;
        ctx.font = `600 15px ${BODY}`;
        ctx.textAlign = "left";
        ctx.fillText(clip(ctx, it.label, tw * 0.55), rx + 8, yy + 14);
        ctx.textAlign = "right";
        ctx.fillText(formatValue(it.value, type, spec.currency), rx + tw - 8, yy + 14);
      });
      const chartX = rx + tw + 30;
      const chartW = rw - tw - 30;
      shadowed(ctx, 12, 4, 0.12, () => {
        ctx.fillStyle = "#fff";
        rr(ctx, chartX, ry - 10, chartW, 300, 10);
        ctx.fill();
      });
      ctx.strokeStyle = "#e7e2da";
      rr(ctx, chartX, ry - 10, chartW, 300, 10);
      ctx.stroke();
      drawDonut(ctx, spec, b.items.filter((i) => i.value > 0), chartX + 130, ry + 140, 105, type, chartX + 260, 16);
      anchors.chart = [chartX + 130 + 80, ry + 140 - 60];
      ry += Math.max(30 + Math.min(9, b.items.length) * 28, 300) + 40;
    }
    const t = values.trends[0];
    if (t && ry < h - 200) {
      ctx.fillStyle = spec.accent;
      ctx.font = `900 22px ${BODY}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(t.title, rx, ry);
      drawColumns(ctx, spec, t.months, rx, ry + 24, rw, Math.min(220, h - ry - 140));
    }
  } else if (view.kind === "settings") {
    active = SETTINGS_TAB;
    title(SETTINGS_TAB, "Rename, add or remove items. Dropdowns and the dashboard update to match.");
    spec.lists.forEach((l, i) => {
      const lx = x0 + i * 280;
      if (lx + 250 > w) return;
      ctx.fillStyle = spec.accent;
      ctx.fillRect(lx, y0 + 100, 250, 38);
      ctx.fillStyle = "#fff";
      ctx.font = `800 19px ${BODY}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(l.name, lx + 125, y0 + 119);
      [...l.items, "", "", ""].slice(0, 16).forEach((it, k) => {
        const yy = y0 + 138 + k * 36;
        ctx.fillStyle = it ? "#fff" : tint(spec.accent, 0.94);
        ctx.fillRect(lx, yy, 250, 36);
        ctx.strokeStyle = tint(spec.accent, 0.65);
        ctx.strokeRect(lx, yy, 250, 36);
        ctx.fillStyle = INK;
        ctx.font = `600 18px ${BODY}`;
        ctx.textAlign = "left";
        ctx.fillText(it, lx + 10, yy + 18);
      });
    });
  } else if (view.kind === "howto") {
    title(HOW_TO_TAB, spec.title);
    let y = y0 + 130;
    spec.howTo.forEach((step, i) => {
      if (y > h - 140) return;
      ctx.fillStyle = spec.accent;
      ctx.beginPath();
      ctx.arc(x0 + 26, y, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = `900 24px ${BODY}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(i + 1), x0 + 26, y + 1);
      ctx.fillStyle = INK;
      ctx.font = `700 26px ${BODY}`;
      ctx.textAlign = "left";
      y += wrap(ctx, step, x0 + 74, y, cw - 120, 36, 2) + 34;
    });
    ctx.fillStyle = tint(spec.accent, 0.88);
    rr(ctx, x0, Math.min(y + 10, h - 170), cw, 90, 14);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.font = `800 24px ${BODY}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(clip(ctx, "✏️ White cells are for you.  🧮 Shaded cells work themselves out.", cw - 40), x0 + 24, Math.min(y + 10, h - 170) + 45);
  } else {
    const tab = spec.tabs[view.tab];
    const sheet = values.tabs[view.tab].sheets[view.month ?? 0];
    active = sheet.name;
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    title(view.month !== null ? `${months[view.month]}: ${tab.name}` : tab.name, view.month !== null ? spec.title : undefined);
    const rowH = 38;
    drawGrid(ctx, spec, tab, sheet.rows, x0, y0 + 90, cw, rowH, Math.floor((h - y0 - 90 - 70) / rowH) - 1, format === "pdf");
  }

  // Tab strip, scrolled so the active tab shows.
  const stripY = h - 50;
  ctx.fillStyle = "#f3f2f1";
  ctx.fillRect(0, stripY, w, 50);
  ctx.font = `800 18px ${BODY}`;
  const widths = sheets.map((n) => ctx.measureText(n).width + 34);
  let start = 0;
  const activeIdx = Math.max(0, sheets.indexOf(active));
  while (widths.slice(start, activeIdx + 1).reduce((a, b) => a + b + 6, 0) > w - 60 && start < activeIdx) start++;
  let tx = 20;
  sheets.slice(start).forEach((n, i) => {
    const tw = widths[start + i];
    if (tx + tw > w - 10) return;
    const on = n === active;
    ctx.fillStyle = on ? "#fff" : "#e6e5e4";
    rr(ctx, tx, stripY + 6, tw, 38, 6);
    ctx.fill();
    if (on) {
      ctx.fillStyle = format === "excel" ? EXCEL_GREEN : spec.accent;
      ctx.fillRect(tx + 8, stripY + 40, tw - 16, 4);
    }
    ctx.fillStyle = on ? INK : "#555";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(n, tx + 17, stripY + 25);
    tx += tw + 6;
  });
  return Object.assign(c, { anchors });
}

/** A printed A4 page: title band, the table, tick boxes. */
export function renderPage(spec: SheetSpec, values: Values, format: ProductFormat, tabIndex = 0, month: number | null = null) {
  const W = 1240;
  const H = 1754;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  const block = ST.header === "block";
  if (block) {
    ctx.fillStyle = shade(spec.accent, 0.4);
    ctx.fillRect(0, 0, W, 225);
    ctx.fillStyle = spec.accent;
    ctx.fillRect(0, 225, W, 8);
  } else if (ST.header === "band") {
    ctx.fillStyle = spec.accent;
    ctx.fillRect(0, 0, W, 22);
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = block ? "#fff" : ST.header === "underline" ? spec.accent : INK;
  ctx.font = `400 ${dsz(74)}px ${DISPLAY}`;
  const tab = spec.tabs[tabIndex];
  const first = tabIndex === 0 && !month;
  const longMonths = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const pt = disp(ctx, month !== null ? `${longMonths[month]}: ${tab.name}` : first ? spec.title : tab.name);
  ctx.fillText(clip(ctx, pt, W - 140), 70, block ? 125 : 150);
  undisp(ctx);
  if (ST.header === "underline") {
    ctx.fillStyle = spec.accent;
    ctx.fillRect(70, 166, W - 140, 5);
  }
  ctx.fillStyle = block ? tint(spec.accent, 0.75) : MUTED;
  ctx.font = `700 30px ${BODY}`;
  ctx.fillText(clip(ctx, first ? spec.subtitle : spec.title, W - 140), 70, block ? 185 : 210);
  drawGrid(ctx, spec, tab, format === "excel" ? values.tabs[tabIndex].rows : [], 70, block ? 280 : 250, W - 140, 50, block ? 27 : 28, format === "pdf");
  return c;
}

// ───────────── Props ───────────────

function backdrop(ctx: CanvasRenderingContext2D, accent: string) {
  if (ST.bg !== "soft") return patterned(ctx, accent);
  const g = ctx.createLinearGradient(0, 0, 0, PHOTO_H);
  g.addColorStop(0, "#f6f4f0");
  g.addColorStop(1, "#e9e5df");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, PHOTO_W, PHOTO_H);
  const r = ctx.createRadialGradient(PHOTO_W * 0.5, PHOTO_H * 0.45, 100, PHOTO_W * 0.5, PHOTO_H * 0.45, PHOTO_W * 0.75);
  r.addColorStop(0, "rgba(255,255,255,0.7)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = r;
  ctx.fillRect(0, 0, PHOTO_W, PHOTO_H);
  // A whisper of the product colour in the corner.
  ctx.fillStyle = tint(accent, 0.86);
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.arc(PHOTO_W * 0.98, PHOTO_H * 0.02, PHOTO_H * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** The other styles' backdrops: graph paper, a colour block, dots, notebook lines, or a bold stripe. */
function patterned(ctx: CanvasRenderingContext2D, accent: string) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const bg = ST.bg;
  ctx.fillStyle = bg === "bold" ? tint(accent, 0.86) : bg === "lines" ? "#fdfbf6" : "#faf9f7";
  ctx.fillRect(0, 0, W, H);
  if (bg === "grid") {
    ctx.strokeStyle = tint(accent, 0.86);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 60) (ctx.moveTo(x, 0), ctx.lineTo(x, H));
    for (let y = 0; y <= H; y += 60) (ctx.moveTo(0, y), ctx.lineTo(W, y));
    ctx.stroke();
    ctx.fillStyle = tint(accent, 0.7);
    ctx.globalAlpha = 0.35;
    ctx.fillRect(W - 420, 0, 420, 240);
    ctx.globalAlpha = 1;
  } else if (bg === "split") {
    ctx.fillStyle = tint(accent, 0.8);
    ctx.fillRect(0, 0, W, H * 0.44);
    ctx.fillStyle = tint(accent, 0.6);
    ctx.fillRect(0, H * 0.44 - 10, W, 10);
  } else if (bg === "dots") {
    ctx.fillStyle = tint(accent, 0.72);
    for (let y = 30; y < H; y += 44)
      for (let x = (y / 44) % 2 ? 52 : 30; x < W; x += 44) {
        ctx.globalAlpha = 0.18 + 0.32 * (1 - y / H);
        ctx.beginPath();
        ctx.arc(x, y, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
    ctx.globalAlpha = 1;
  } else if (bg === "lines") {
    ctx.fillStyle = tint(accent, 0.82);
    for (let y = 120; y < H; y += 58) ctx.fillRect(0, y, W, 2);
    ctx.fillStyle = tint(accent, 0.45);
    ctx.fillRect(96, 0, 3, H);
  } else if (bg === "bold") {
    ctx.fillStyle = tint(accent, 0.74);
    ctx.beginPath();
    ctx.moveTo(W * 0.55, 0);
    ctx.lineTo(W, 0);
    ctx.lineTo(W, H * 0.25);
    ctx.lineTo(W * 0.15, H);
    ctx.lineTo(0, H);
    ctx.lineTo(0, H * 0.82);
    ctx.closePath();
    ctx.fill();
  }
  const r = ctx.createRadialGradient(W * 0.5, H * 0.5, 100, W * 0.5, H * 0.5, W * 0.7);
  r.addColorStop(0, "rgba(255,255,255,0.45)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = r;
  ctx.fillRect(0, 0, W, H);
}

/** The style's decoration at (x, y), about s pixels big: a plant, shapes, a sprig or confetti. */
function prop(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, accent: string) {
  if (ST.prop === "plant") return plant(ctx, x, y, s);
  const colours = chartColours(accent);
  if (ST.prop === "shapes") {
    shadowed(ctx, 24, 10, 0.18, () => {
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(x - s * 0.12, y - s * 0.1, s * 0.26, 0, Math.PI * 2);
      ctx.fill();
    });
    shadowed(ctx, 24, 10, 0.18, () => {
      ctx.fillStyle = colours[1];
      rr(ctx, x + s * 0.02, y - s * 0.5, s * 0.34, s * 0.34, s * 0.05);
      ctx.fill();
    });
    shadowed(ctx, 24, 10, 0.18, () => {
      ctx.fillStyle = colours[2];
      ctx.beginPath();
      ctx.moveTo(x + s * 0.1, y + s * 0.2);
      ctx.lineTo(x + s * 0.42, y + s * 0.2);
      ctx.lineTo(x + s * 0.26, y - s * 0.08);
      ctx.closePath();
      ctx.fill();
    });
  } else if (ST.prop === "sprig") {
    const deep = shade(accent, 0.25);
    ctx.strokeStyle = deep;
    ctx.lineWidth = Math.max(3, s * 0.012);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.25);
    ctx.quadraticCurveTo(x - s * 0.12, y - s * 0.2, x + s * 0.05, y - s * 0.6);
    ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const t = 0.15 + i * 0.14;
      const lx = x - s * 0.08 * Math.sin(t * Math.PI) + s * 0.05 * t;
      const ly = y + s * 0.25 - s * 0.85 * t;
      const side = i % 2 ? 1 : -1;
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(side * 0.9 - 0.2);
      ctx.fillStyle = i % 2 ? tint(accent, 0.3) : deep;
      ctx.beginPath();
      ctx.ellipse(0, -s * 0.09, s * 0.04, s * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  } else {
    // Confetti: a scatter of little shapes, the same every time for the same spot.
    let seed = Math.round(x * 7 + y * 13);
    const rand = () => ((seed = (seed * 16807) % 2147483647) % 1000) / 1000;
    for (let i = 0; i < 26; i++) {
      const cx = x + (rand() - 0.5) * s * 1.3;
      const cy = y + (rand() - 0.5) * s;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rand() * Math.PI);
      ctx.fillStyle = colours[i % 5];
      const k = s * (0.025 + rand() * 0.03);
      if (i % 3 === 0) {
        ctx.beginPath();
        ctx.arc(0, 0, k, 0, Math.PI * 2);
        ctx.fill();
      } else ctx.fillRect(-k, -k * 0.4, k * 2.4, k * 0.8);
      ctx.restore();
    }
  }
}

function plant(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  // Leaves.
  const leaves = [
    [-0.15, -1.0, -0.5],
    [0.1, -1.15, 0.15],
    [0.3, -0.95, 0.6],
    [-0.3, -0.75, -0.9],
    [0.4, -0.7, 1.0],
    [0, -0.85, 0],
  ];
  leaves.forEach(([dx, dy, rot], i) => {
    ctx.save();
    ctx.translate(x + dx * s * 0.6, y + dy * s * 0.55);
    ctx.rotate(rot);
    ctx.fillStyle = i % 2 ? "#6f8f63" : "#55764b";
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.09, s * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.28);
    ctx.lineTo(0, s * 0.28);
    ctx.stroke();
    ctx.restore();
  });
  // Pot.
  shadowed(ctx, 30, 14, 0.25, () => {
    ctx.fillStyle = "#f1ece4";
    ctx.beginPath();
    ctx.moveTo(x - s * 0.22, y - s * 0.12);
    ctx.lineTo(x + s * 0.22, y - s * 0.12);
    ctx.lineTo(x + s * 0.17, y + s * 0.2);
    ctx.lineTo(x - s * 0.17, y + s * 0.2);
    ctx.closePath();
    ctx.fill();
  });
  ctx.fillStyle = "#e4ddd2";
  ctx.fillRect(x - s * 0.23, y - s * 0.14, s * 0.46, s * 0.05);
}

function laptop(ctx: CanvasRenderingContext2D, screen: HTMLCanvasElement, x: number, y: number, w: number) {
  const h = w * 0.63;
  shadowed(ctx, 60, 30, 0.3, () => {
    ctx.fillStyle = "#1d1d1f";
    rr(ctx, x, y, w, h, w * 0.025);
    ctx.fill();
  });
  const b = w * 0.022;
  ctx.drawImage(screen, x + b, y + b, w - b * 2, h - b * 2.2);
  const by = y + h;
  const g = ctx.createLinearGradient(0, by, 0, by + w * 0.035);
  g.addColorStop(0, "#d9d9de");
  g.addColorStop(1, "#a1a1a8");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x - w * 0.07, by);
  ctx.lineTo(x + w * 1.07, by);
  ctx.lineTo(x + w * 1.04, by + w * 0.035);
  ctx.lineTo(x - w * 0.04, by + w * 0.035);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#8f8f97";
  rr(ctx, x + w * 0.43, by, w * 0.14, w * 0.01, 4);
  ctx.fill();
}

/** A tablet or phone: rounded black body with the screen fitted top-down. */
function device(ctx: CanvasRenderingContext2D, screen: HTMLCanvasElement, x: number, y: number, w: number, h: number, radius: number) {
  shadowed(ctx, 50, 24, 0.32, () => {
    ctx.fillStyle = "#1d1d1f";
    rr(ctx, x, y, w, h, radius);
    ctx.fill();
  });
  const b = Math.max(10, w * 0.04);
  ctx.save();
  rr(ctx, x + b, y + b, w - b * 2, h - b * 2, radius * 0.6);
  ctx.clip();
  ctx.fillStyle = "#fff";
  ctx.fillRect(x + b, y + b, w - b * 2, h - b * 2);
  // Cover the screen, anchored top-left (like a phone showing part of the sheet).
  const iw = w - b * 2;
  const ih = h - b * 2;
  const scale = Math.max(iw / screen.width, ih / screen.height);
  ctx.drawImage(screen, 0, 0, iw / scale, ih / scale, x + b, y + b, iw, ih);
  ctx.restore();
}

function paper(ctx: CanvasRenderingContext2D, page: HTMLCanvasElement, cx: number, cy: number, h: number, deg: number) {
  const w = h / 1.414;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((deg * Math.PI) / 180);
  shadowed(ctx, 40, 18, 0.25, () => {
    ctx.fillStyle = "#fff";
    ctx.fillRect(-w / 2, -h / 2, w, h);
  });
  ctx.drawImage(page, -w / 2, -h / 2, w, h);
  ctx.restore();
}

/** Sets the biggest bold font (up to `size`) that fits `text` in `max`; returns the size. */
function fitFont(ctx: CanvasRenderingContext2D, text: string, size: number, max: number) {
  let fs = Math.round(size);
  ctx.font = `900 ${fs}px ${BODY}`;
  while (fs > 10 && ctx.measureText(text).width > max) ctx.font = `900 ${--fs}px ${BODY}`;
  return fs;
}

/** Round badge: big first word (e.g. "16"), small rest ("TABS"). */
function badge(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, r: number, accent: string) {
  const square = ST.badge === "square";
  shadowed(ctx, 18, 8, 0.2, () => {
    ctx.fillStyle = square ? accent : "#fff";
    ctx.beginPath();
    if (square) ctx.roundRect(cx - r, cy - r, r * 2, r * 2, r * 0.22 * ST.round);
    else ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.strokeStyle = square ? "rgba(255,255,255,0.7)" : accent;
  ctx.lineWidth = r * (square ? 0.035 : 0.07);
  ctx.beginPath();
  if (square) ctx.roundRect(cx - r * 0.86, cy - r * 0.86, r * 1.72, r * 1.72, r * 0.16 * ST.round);
  else ctx.arc(cx, cy, r * 0.88, 0, Math.PI * 2);
  ctx.stroke();
  const [first, ...rest] = text.split(" ");
  const big = /^\d+$/.test(first);
  ctx.fillStyle = square ? "#fff" : INK;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (big) {
    ctx.font = `900 ${Math.round(r * 0.62)}px ${BODY}`;
    ctx.fillText(first, cx, cy - r * 0.12);
    fitFont(ctx, rest.join(" "), r * 0.22, r * 1.4);
    ctx.fillText(rest.join(" "), cx, cy + r * 0.4);
  } else {
    const words = text.split(" ");
    const lines = words.length > 1 ? [words.slice(0, Math.ceil(words.length / 2)).join(" "), words.slice(Math.ceil(words.length / 2)).join(" ")] : [text];
    const size = Math.min(...lines.map((l) => fitFont(ctx, l, r * 0.26, r * 1.45)));
    ctx.font = `900 ${size}px ${BODY}`;
    lines.forEach((l, i) => ctx.fillText(clip(ctx, l, r * 1.55), cx, cy + (i - (lines.length - 1) / 2) * size * 1.2));
  }
}

function sticker(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  ctx.font = `900 34px ${BODY}`;
  const w = ctx.measureText(text).width + 100;
  shadowed(ctx, 14, 6, 0.2, () => {
    ctx.fillStyle = "#f8e58c";
    rr(ctx, x, y, w, 64, 32);
    ctx.fill();
  });
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  rr(ctx, x, y, w, 64, 32);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + 36, y + 32, 16, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + 28, y + 32);
  ctx.lineTo(x + 34, y + 39);
  ctx.lineTo(x + 45, y + 25);
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + 64, y + 34);
}

/** Small "works with" tiles (generic, no brand logos). */
function compatTiles(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, format: ProductFormat) {
  const tiles = format === "excel" ? [["XLSX", EXCEL_GREEN], ["SHEETS", "#188038"]] : [["PDF", "#c0392b"], ["A4", "#5b7f6e"]];
  tiles.forEach(([label, colour], i) => {
    const tx = x + i * (s + 16);
    shadowed(ctx, 12, 6, 0.2, () => {
      ctx.fillStyle = colour;
      rr(ctx, tx, y, s, s, s * 0.18);
      ctx.fill();
    });
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 2;
    for (let g = 1; g < 3; g++) {
      ctx.beginPath();
      ctx.moveTo(tx + (s * g) / 3, y + s * 0.18);
      ctx.lineTo(tx + (s * g) / 3, y + s * 0.82);
      ctx.stroke();
    }
    ctx.fillStyle = "#fff";
    ctx.font = `900 ${Math.round(s * 0.22)}px ${BODY}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, tx + s / 2, y + s / 2);
  });
}

function eyebrow(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, align: CanvasTextAlign = "center", colour = MUTED) {
  ctx.fillStyle = colour;
  ctx.font = `800 26px ${BODY}`;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.letterSpacing = "6px";
  ctx.fillText(text.toUpperCase(), x, y);
  ctx.letterSpacing = "0px";
}

/** Serif title; "The …" gets a small "The" above, like a book cover. */
function serifTitle(ctx: CanvasRenderingContext2D, title: string, x: number, y: number, maxW: number, size: number, align: CanvasTextAlign = "center", colour = INK) {
  ctx.fillStyle = colour;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  const m = /^the\s+(.+)$/i.exec(title);
  let yy = y;
  size = dsz(size);
  if (m) {
    ctx.font = `400 ${Math.round(size * 0.5)}px ${DISPLAY}`;
    ctx.fillText(disp(ctx, "The"), x, yy);
    yy += size * 0.95;
  }
  let main = disp(ctx, m ? m[1] : title);
  ctx.font = `400 ${size}px ${DISPLAY}`;
  let fs = size;
  while (ctx.measureText(main).width > maxW && fs > size * 0.55) {
    fs -= 4;
    ctx.font = `400 ${fs}px ${DISPLAY}`;
  }
  if (ctx.measureText(main).width > maxW) main = clip(ctx, main, maxW);
  ctx.fillText(main, x, yy);
  undisp(ctx);
  return yy;
}

function featureBar(ctx: CanvasRenderingContext2D, items: string[], accent: string) {
  const solid = ST.bar === "accent";
  ctx.fillStyle = solid ? accent : "#fff";
  ctx.fillRect(0, PHOTO_H - 92, PHOTO_W, 92);
  ctx.fillStyle = solid ? shade(accent, 0.35) : accent;
  ctx.fillRect(0, PHOTO_H - 92, PHOTO_W, 5);
  ctx.fillStyle = solid ? "#fff" : INK;
  ctx.font = `900 32px ${BODY}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.letterSpacing = "4px";
  ctx.fillText(items.map((i) => i.toUpperCase()).join("   |   "), PHOTO_W / 2, PHOTO_H - 44);
  ctx.letterSpacing = "0px";
}

function slideTitle(ctx: CanvasRenderingContext2D, kicker: string, title: string, sub?: string) {
  eyebrow(ctx, kicker, PHOTO_W / 2, 92);
  ctx.fillStyle = INK;
  ctx.font = `400 ${dsz(92)}px ${DISPLAY}`;
  ctx.textAlign = "center";
  ctx.fillText(clip(ctx, disp(ctx, title), PHOTO_W - 200), PHOTO_W / 2, 200);
  undisp(ctx);
  if (sub) {
    ctx.fillStyle = MUTED;
    ctx.font = `700 38px ${BODY}`;
    ctx.fillText(clip(ctx, sub, PHOTO_W - 260), PHOTO_W / 2, 262);
  }
}

function callout(ctx: CanvasRenderingContext2D, text: string, bx: number, by: number, tx: number, ty: number, colour: string) {
  ctx.strokeStyle = colour;
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.setLineDash([2, 12]);
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(tx, ty);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.arc(tx, ty, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = `900 36px ${BODY}`;
  const w = ctx.measureText(text).width + 60;
  shadowed(ctx, 16, 6, 0.22, () => {
    ctx.fillStyle = colour;
    rr(ctx, bx - w / 2, by - 38, w, 76, 38);
    ctx.fill();
  });
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, bx, by + 2);
}

function check(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, colour: string) {
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.arc(x, y, s / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = s * 0.12;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x - s * 0.22, y);
  ctx.lineTo(x - s * 0.05, y + s * 0.18);
  ctx.lineTo(x + s * 0.25, y - s * 0.18);
  ctx.stroke();
}

// ───────────── The photo set ─────────────

export interface ListingPictures {
  listing: Blob[];
  screens: { table: Blob; dash?: Blob; page: Blob };
}

export async function buildListingPhotos(spec: SheetSpec, format: ProductFormat): Promise<ListingPictures> {
  useStyle(styleOf(spec.style));
  try {
    return await drawListingPhotos(spec, format);
  } finally {
    useStyle(STYLES.classic);
  }
}

async function drawListingPhotos(spec: SheetSpec, format: ProductFormat): Promise<ListingPictures> {
  await loadPhotoFonts();
  const values = previewValues(spec);
  const excel = format === "excel";
  const m = marketingFor(spec, format);
  const tabs = tabCount(spec);
  const firstSheet = dataSheets(spec)[0];
  const tableShot = renderSheetShot(spec, values, { kind: "tab", tab: 0, month: firstSheet?.month ?? null }, format);
  const dashShot = excel && hasDashboard(spec) ? renderSheetShot(spec, values, { kind: "dashboard" }, format) : null;
  const page = renderPage(spec, values, format);
  const listing: Blob[] = [];
  const accent = spec.accent;

  // 1. Cover, laid out the style's way.
  {
    const [c, ctx] = canvas(PHOTO_W, PHOTO_H);
    backdrop(ctx, accent);
    const kicker = excel ? "Excel & Google Sheets" : "Printable PDF";
    const bar = excel ? ["Instant download", hasDashboard(spec) ? "Automated dashboard" : "Easy to use", `${tabs} tabs`] : ["Instant download", "Print at home", "A4 + US Letter"];
    const stick = excel ? "Fully editable" : "Instant download";
    if (ST.cover === "left") {
      // Words down the left, devices to the right, badges in a row.
      eyebrow(ctx, kicker, 120, 150, "left", accent);
      ctx.font = `400 ${dsz(124)}px ${DISPLAY}`;
      const tt = disp(ctx, spec.title);
      ctx.fillStyle = INK;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      const th = wrap(ctx, tt, 120, 150 + dsz(124), 820, dsz(124) * 1.02, 3);
      undisp(ctx);
      ctx.fillStyle = accent;
      ctx.fillRect(122, 150 + th + 40, 120, 8);
      ctx.fillStyle = MUTED;
      ctx.font = `800 36px ${BODY}`;
      const tg = wrap(ctx, m.tagline, 120, 150 + th + 110, 780, 48, 2);
      const by = Math.min(150 + th + 110 + tg + 110, 1000);
      m.badges.slice(0, 4).forEach((b, i) => badge(ctx, b, 200 + i * 190, by, 80, accent));
      sticker(ctx, stick, 120, by + 140);
      compatTiles(ctx, 120 + 20 + ctx.measureText(stick).width + 120, by + 136, 72, format);
      if (excel) {
        laptop(ctx, dashShot ?? tableShot, 930, 380, 960);
        device(ctx, tableShot, 1560, 700, 330, 560, 32);
      } else {
        paper(ctx, page, 1260, 760, 900, -5);
        paper(ctx, page, 1560, 830, 820, 6);
      }
      prop(ctx, 1000, 1220, 300, accent);
    } else if (ST.cover === "bottom") {
      // Devices up top, the title in a white panel underneath.
      if (excel) {
        laptop(ctx, dashShot ?? tableShot, 470, 110, 1000);
        device(ctx, tableShot, 1330, 300, 380, 560, 32);
      } else {
        paper(ctx, page, 820, 500, 700, -5);
        paper(ctx, page, 1180, 520, 700, 4);
      }
      m.badges.slice(0, 2).forEach((b, i) => badge(ctx, b, 200, 470 + i * 190, 80, accent));
      m.badges.slice(2, 4).forEach((b, i) => badge(ctx, b, 1855, 160 + i * 190, 80, accent));
      sticker(ctx, stick, 60, 60);
      compatTiles(ctx, 60, 150, 72, format);
      prop(ctx, 1830, 830, 240, accent);
      shadowed(ctx, 30, -6, 0.1, () => {
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 900, PHOTO_W, PHOTO_H - 900);
      });
      ctx.fillStyle = accent;
      ctx.fillRect(0, 900, PHOTO_W, 8);
      eyebrow(ctx, kicker, PHOTO_W / 2, 990, "center", accent);
      const titleY = serifTitle(ctx, spec.title, PHOTO_W / 2, /^the\s/i.test(spec.title) ? 1075 : 1150, PHOTO_W - 300, 124);
      ctx.fillStyle = MUTED;
      ctx.font = `800 36px ${BODY}`;
      ctx.textAlign = "center";
      ctx.fillText(clip(ctx, m.tagline, PHOTO_W - 300), PHOTO_W / 2, titleY + 70);
    } else if (ST.cover === "banner") {
      // A colour banner across the top, the title in it, devices overlapping its edge.
      ctx.fillStyle = accent;
      ctx.fillRect(0, 0, PHOTO_W, 560);
      ctx.fillStyle = shade(accent, 0.3);
      ctx.fillRect(0, 548, PHOTO_W, 12);
      eyebrow(ctx, kicker, PHOTO_W / 2, 100, "center", tint(accent, 0.7));
      const titleY = serifTitle(ctx, spec.title, PHOTO_W / 2, /^the\s/i.test(spec.title) ? 200 : 270, PHOTO_W - 300, 136, "center", "#fff");
      ctx.fillStyle = tint(accent, 0.82);
      ctx.font = `800 36px ${BODY}`;
      ctx.textAlign = "center";
      ctx.fillText(clip(ctx, m.tagline, PHOTO_W - 300), PHOTO_W / 2, titleY + 70);
      if (excel) {
        laptop(ctx, dashShot ?? tableShot, 520, 470, 960);
        device(ctx, tableShot, 1380, 640, 380, 560, 32);
      } else {
        paper(ctx, page, 860, 900, 720, -5);
        paper(ctx, page, 1200, 920, 720, 4);
      }
      m.badges.slice(0, 3).forEach((b, i) => badge(ctx, b, 250, 720 + i * 190, 80, accent));
      sticker(ctx, stick, 60, 1300);
      prop(ctx, 1860, 1240, 300, accent);
    } else {
      eyebrow(ctx, kicker, PHOTO_W / 2, 80);
      const titleY = serifTitle(ctx, spec.title, PHOTO_W / 2, /^the\s/i.test(spec.title) ? 190 : 250, PHOTO_W - 360, 140);
      ctx.fillStyle = accent;
      ctx.font = `900 36px ${BODY}`;
      ctx.textAlign = "center";
      ctx.fillText(clip(ctx, m.tagline, PHOTO_W - 300), PHOTO_W / 2, titleY + 58);
      prop(ctx, 150, 1180, 420, accent);
      if (excel) {
        laptop(ctx, dashShot ?? tableShot, 330, 470, 1080);
        device(ctx, tableShot, 1290, 640, 420, 560, 34);
        if (dashShot) device(ctx, dashShot, 1490, 860, 240, 470, 36);
      } else {
        paper(ctx, page, 800, 900, 760, -6);
        paper(ctx, page, 1180, 880, 760, 5);
      }
      m.badges.slice(0, 4).forEach((b, i) => badge(ctx, b, excel ? 1860 : 1700, 500 + i * 180, 74, accent));
      sticker(ctx, stick, 60, 330);
      compatTiles(ctx, 60, 420, 74, format);
    }
    featureBar(ctx, bar, accent);
    listing.push(await toJpeg(c));
  }

  // 2. What's inside.
  {
    const [c, ctx] = canvas(PHOTO_W, PHOTO_H);
    backdrop(ctx, accent);
    slideTitle(ctx, "What's inside", excel ? `${tabs} tabs, all set up for you` : `${pageCount(spec)} printable pages`, m.tagline);
    const cards: { name: string; note: string; shot: HTMLCanvasElement | null; page?: boolean }[] = [];
    if (dashShot) cards.push({ name: SUMMARY_TAB, note: "Totals, goals & charts", shot: dashShot });
    if (spec.lists.length && excel) cards.push({ name: SETTINGS_TAB, note: `Edit your ${spec.lists.map((l) => l.name.toLowerCase()).join(" & ")}`, shot: renderSheetShot(spec, values, { kind: "settings" }, format) });
    spec.tabs.forEach((t, i) =>
      cards.push({
        name: t.repeat === "months" ? `${t.name} · Jan to Dec` : t.name,
        note: t.repeat === "months" ? "12 monthly tabs" : t.columns.slice(0, 3).map((col) => col.header).join(" · "),
        shot: excel ? renderSheetShot(spec, values, { kind: "tab", tab: i, month: t.repeat === "months" ? 0 : null }, format) : renderPage(spec, values, format, i, t.repeat === "months" ? 0 : null),
        page: !excel,
      }),
    );
    if (excel) cards.push({ name: HOW_TO_TAB, note: "Simple steps to get started", shot: renderSheetShot(spec, values, { kind: "howto" }, format) });
    const shown = cards.slice(0, 6);
    const cols = shown.length > 4 ? 3 : 2;
    const gap = 46;
    const cw = (PHOTO_W - 240 - gap * (cols - 1)) / cols;
    const rows = Math.ceil(shown.length / cols);
    const ch = Math.min(520, (PHOTO_H - 380 - gap * (rows - 1)) / rows);
    shown.forEach((card, i) => {
      const x = 120 + (i % cols) * (cw + gap);
      const y = 330 + Math.floor(i / cols) * (ch + gap);
      shadowed(ctx, 30, 12, 0.18, () => {
        ctx.fillStyle = "#fff";
        rr(ctx, x, y, cw, ch, 24 * ST.round);
        ctx.fill();
      });
      ctx.save();
      rr(ctx, x + 16, y + 16, cw - 32, ch - 120, 14);
      ctx.clip();
      if (card.shot && card.page) {
        // A printed page standing in a soft tinted panel.
        ctx.fillStyle = tint(accent, 0.9);
        ctx.fillRect(x + 16, y + 16, cw - 32, ch - 120);
        const ph = ch - 150;
        const pw = ph / 1.414;
        shadowed(ctx, 16, 6, 0.2, () => ctx.drawImage(card.shot!, x + cw / 2 - pw / 2, y + 31, pw, ph));
      } else if (card.shot) ctx.drawImage(card.shot, 0, 0, card.shot.width, card.shot.width * ((ch - 120) / (cw - 32)), x + 16, y + 16, cw - 32, ch - 120);
      else {
        ctx.fillStyle = tint(accent, 0.88);
        ctx.fillRect(x + 16, y + 16, cw - 32, ch - 120);
        ctx.fillStyle = accent;
        ctx.font = `400 ${dsz(140)}px ${DISPLAY}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("?", x + cw / 2, y + 16 + (ch - 120) / 2);
      }
      ctx.restore();
      ctx.fillStyle = INK;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.font = `900 34px ${BODY}`;
      ctx.fillText(clip(ctx, card.name, cw - 60), x + 28, y + ch - 60);
      ctx.fillStyle = MUTED;
      ctx.font = `700 26px ${BODY}`;
      ctx.fillText(clip(ctx, card.note, cw - 60), x + 28, y + ch - 24);
    });
    listing.push(await toJpeg(c));
  }

  // 3. The dashboard (Excel) or a page close-up (PDF), with callouts.
  {
    const [c, ctx] = canvas(PHOTO_W, PHOTO_H);
    backdrop(ctx, accent);
    if (dashShot) {
      slideTitle(ctx, "Automated dashboard", "It does the maths for you", "Type in the white cells. Everything else works itself out.");
      const lx = 380;
      const ly = 380;
      const lw = 1240;
      laptop(ctx, dashShot, lx, ly, lw);
      // Shot pixels → photo pixels, through the laptop screen.
      const b = lw * 0.022;
      const sx = (lw - b * 2) / dashShot.width;
      const sy = (lw * 0.63 - b * 2.2) / dashShot.height;
      const at = (p: [number, number]): [number, number] => [lx + b + p[0] * sx, ly + b + p[1] * sy];
      const a = dashShot.anchors ?? {};
      if (a.totals) callout(ctx, "Totals update as you type", 330, 1300, ...at(a.totals), accent);
      if (a.chart) callout(ctx, "Charts build themselves", 1640, 1330, ...at(a.chart), "#2e7d32");
      if (a.goal) callout(ctx, "Goal progress bars", 1000, 1380, ...at(a.goal), "#e9a96b");
    } else {
      slideTitle(ctx, "Made to fill in", "Print it, grab a pen", "Clear columns, tick boxes and plenty of room to write.");
      paper(ctx, page, PHOTO_W / 2, 880, 1080, -2);
      callout(ctx, "Tick boxes", 1640, 1300, 1150, 900, accent);
      callout(ctx, "Plenty of rows", 360, 1300, 700, 1000, "#2e7d32");
    }
    listing.push(await toJpeg(c));
  }

  // 4–5. Feature slides: the main tab, then Settings (or the second tab).
  const features: { kicker: string; title: string; bullets: string[]; shot: HTMLCanvasElement }[] = [];
  const t0 = spec.tabs[0];
  const pageFor = (i: number) => renderPage(spec, values, format, i, spec.tabs[i].repeat === "months" ? 0 : null);
  features.push({
    kicker: t0.repeat === "months" ? (excel ? "A tab for every month" : "A page for every month") : excel ? "Your tracker" : "Your planner",
    title: t0.name,
    bullets: excel
      ? ([
          ...t0.columns.filter((c) => c.optionsFrom).map((c) => `${c.header} dropdowns`),
          ...t0.columns.filter((c) => c.type === "checkbox").map((c) => `${c.header.replace(/\?$/, "")} tick boxes`),
          ...t0.columns.filter((c) => c.formula).map((c) => `${c.header} worked out for you`),
          t0.totals ? "Totals at the bottom" : null,
          t0.repeat === "months" ? "Jan to Dec, ready to go" : null,
          `${t0.blankRows}+ rows to fill in`,
        ].filter(Boolean) as string[])
      : ([
          `Columns for ${t0.columns.slice(0, 2).map((c) => c.header.toLowerCase()).join(", ")}`,
          t0.columns.some((c) => c.type === "checkbox") ? "Tick boxes as you go" : null,
          t0.repeat === "months" ? "January to December" : null,
          "Plenty of rows to write in",
          "A4 and US Letter",
        ].filter(Boolean) as string[]),
    shot: excel ? tableShot : pageFor(0),
  });
  if (spec.lists.length && excel)
    features.push({
      kicker: "Make it yours",
      title: "Editable settings",
      bullets: [`Rename your ${spec.lists[0].name.toLowerCase()}`, "Add your own items", "Dropdowns update to match", hasDashboard(spec) ? "The dashboard follows too" : "Everything stays in sync"],
      shot: renderSheetShot(spec, values, { kind: "settings" }, format),
    });
  else if (spec.tabs[1])
    features.push({
      kicker: "Also included",
      title: spec.tabs[1].name,
      bullets: spec.tabs[1].columns.slice(0, 5).map((c) => (c.formula && excel ? `${c.header} worked out for you` : c.header)),
      shot: excel ? renderSheetShot(spec, values, { kind: "tab", tab: 1, month: spec.tabs[1].repeat === "months" ? 0 : null }, format) : pageFor(1),
    });
  for (const f of features) {
    const [c, ctx] = canvas(PHOTO_W, PHOTO_H);
    backdrop(ctx, accent);
    // Some styles put the words on the right and the picture on the left.
    const flip = ST.cover !== "centre";
    const tx = flip ? 1260 : 120;
    eyebrow(ctx, f.kicker, tx, 220, "left", flip ? accent : MUTED);
    ctx.fillStyle = INK;
    ctx.textAlign = "left";
    ctx.font = `400 ${dsz(96)}px ${DISPLAY}`;
    ctx.textBaseline = "alphabetic";
    let ty = 330;
    ty += wrap(ctx, disp(ctx, f.title), tx, ty, 640, dsz(100), 2);
    undisp(ctx);
    f.bullets.slice(0, 6).forEach((b, i) => {
      const by = ty + 60 + i * 96;
      check(ctx, tx + 30, by - 14, 50, accent);
      ctx.fillStyle = INK;
      ctx.font = `800 40px ${BODY}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(clip(ctx, b, 580), tx + 80, by);
    });
    if (excel) device(ctx, f.shot, flip ? 90 : 860, 260, 1060, 760, 40);
    else paper(ctx, f.shot, flip ? 650 : 1330, 790, 1060, flip ? -3 : 3);
    if (flip) prop(ctx, 1830, 1270, 260, accent);
    else prop(ctx, 1840, 1260, 300, accent);
    listing.push(await toJpeg(c));
  }

  // 6. Works everywhere / what you get.
  {
    const [c, ctx] = canvas(PHOTO_W, PHOTO_H);
    backdrop(ctx, accent);
    slideTitle(ctx, "What you get", excel ? "Works on any device" : "Print as many as you like", excel ? "Excel, Google Sheets and Apple Numbers, on computer, tablet or phone" : "A4 and US Letter, at home or at a print shop");
    if (excel) {
      laptop(ctx, tableShot, 180, 400, 900);
      device(ctx, dashShot ?? tableShot, 1180, 380, 470, 640, 34);
      device(ctx, dashShot ?? tableShot, 1700, 560, 220, 440, 34);
    } else {
      paper(ctx, page, 700, 760, 760, -4);
      paper(ctx, page, 1300, 760, 680, 3);
    }
    const perks = excel ? ["Instant download", "No subscription", "Reusable every year", "Easy to edit"] : ["Instant download", "Print at home", "Reuse every year", "Fill in by hand"];
    ctx.font = `900 36px ${BODY}`;
    const perkW = perks.map((p) => ctx.measureText(p).width + 46);
    const perkGap = (PHOTO_W - 240 - perkW.reduce((a, b) => a + b, 0)) / (perks.length - 1);
    perks.forEach((p, i) => {
      const x = 148 + perkW.slice(0, i).reduce((a, b) => a + b + perkGap, 0);
      check(ctx, x, 1275, 56, accent);
      ctx.fillStyle = INK;
      ctx.font = `900 36px ${BODY}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(p, x + 46, 1277);
    });
    listing.push(await toJpeg(c));
  }

  // 7. How it works in 3 steps.
  {
    const [c, ctx] = canvas(PHOTO_W, PHOTO_H);
    backdrop(ctx, accent);
    slideTitle(ctx, "Easy as 1, 2, 3", "How it works");
    const steps = excel
      ? [
          ["Download", "Your files arrive straight away after checkout."],
          ["Open", "In Excel, or upload to Google Sheets (File → Import)."],
          ["Type", "Fill in the white cells and watch everything update."],
        ]
      : [
          ["Download", "Your files arrive straight away after checkout."],
          ["Print", "At home on A4 or US Letter, or at a print shop."],
          ["Fill in", "Grab a pen and start planning."],
        ];
    steps.forEach(([title, body], i) => {
      const x = 140 + i * 600;
      shadowed(ctx, 30, 12, 0.16, () => {
        ctx.fillStyle = "#fff";
        rr(ctx, x, 380, 540, 820, 30 * ST.round);
        ctx.fill();
      });
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(x + 270, 560, 110, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = `400 ${dsz(150)}px ${DISPLAY}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(i + 1), x + 270, 572);
      ctx.fillStyle = INK;
      ctx.font = `400 ${dsz(76)}px ${DISPLAY}`;
      ctx.textBaseline = "alphabetic";
      ctx.fillText(disp(ctx, title), x + 270, 790);
      undisp(ctx);
      ctx.fillStyle = MUTED;
      ctx.font = `700 38px ${BODY}`;
      ctx.textAlign = "left";
      wrap(ctx, body, x + 50, 880, 440, 54, 5);
    });
    listing.push(await toJpeg(c));
  }

  // 8. Features at a glance (Excel) / the printable page (both).
  if (excel) {
    const [c, ctx] = canvas(PHOTO_W, PHOTO_H);
    backdrop(ctx, accent);
    slideTitle(ctx, "Bonus included", "Prefer paper? Print it", "A printable PDF in A4 and US Letter comes with it");
    paper(ctx, page, 700, 900, 1000, -4);
    m.features.slice(0, 5).forEach((f, i) => {
      const y = 480 + i * 150;
      check(ctx, 1210, y, 60, accent);
      ctx.fillStyle = INK;
      ctx.font = `800 44px ${BODY}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(clip(ctx, f, 640), 1265, y + 2);
    });
    listing.push(await toJpeg(c));
  }

  const toBlob = (cv: HTMLCanvasElement) => toJpeg(cv);
  return { listing, screens: { table: await toBlob(excel ? tableShot : page), dash: dashShot ? await toBlob(dashShot) : undefined, page: await toBlob(page) } };
}

// The kit, for other photo sets (🎁 bundles).
export { backdrop, badge, canvas, check, clip, eyebrow, featureBar, INK, MUTED, plant, rr, SANS, serifTitle, shadowed, slideTitle, toJpeg };
