// Pinterest pins, drawn on your device at 1000 × 1500 px (Pinterest's 2:3), from the
// product's listing photos, in the same look as the listing photo set.
import { canvas, check, clip, eyebrow, INK, loadPhotoFonts, MUTED, rr, SANS, serifTitle, shadowed, tint, toJpeg } from "./listingPhotos";
import { loadImageSrc } from "./files";
import type { ProductFormat } from "../../shared/format";

export const PIN_W = 1000;
export const PIN_H = 1500;
const SERIF = '"DM Serif Display", Georgia, serif';
const DEFAULT_ACCENT = "#4f46e5";

export const PIN_LAYOUTS = [
  { id: "band", label: "Photo + title band" },
  { id: "headline", label: "Headline + download strip" },
  { id: "collage", label: "Photo collage" },
] as const;
export type PinLayout = (typeof PIN_LAYOUTS)[number]["id"];

export interface PinInput {
  title: string;
  format: ProductFormat;
  accent?: string | null;
  photos: HTMLImageElement[];
}

const KIND: Record<ProductFormat, string> = { art: "Printable wall art", excel: "Spreadsheet template", pdf: "Printable planner" };
const STRIP: Record<ProductFormat, string> = { art: "Instant download · Print at home", excel: "Instant download · Excel + Google Sheets", pdf: "Instant download · Print at home" };

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't load a listing photo"));
    img.src = src;
  });
}

/** Loads up to `max` listing photos (from their stored keys) ready to draw. */
export async function loadPinPhotos(keys: string[], max = 3): Promise<HTMLImageElement[]> {
  await loadPhotoFonts();
  const out: HTMLImageElement[] = [];
  for (const key of keys.slice(0, max)) {
    try {
      out.push(await loadImg(await loadImageSrc(key)));
    } catch {
      /* skip a missing photo */
    }
  }
  if (!out.length) throw new Error("Couldn't load this product's listing photos.");
  return out;
}

/** Draw `img` to fill the box (cropping the overflow, like CSS object-fit: cover). */
function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, radius = 0) {
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / s;
  const sh = h / s;
  ctx.save();
  if (radius) {
    rr(ctx, x, y, w, h, radius);
    ctx.clip();
  }
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
  ctx.restore();
}

/** Serif headline over up to 3 lines, shrinking to fit. Returns the height used. */
function headline(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, maxW: number, size: number, maxLines = 3) {
  let fs = size;
  let lines: string[] = [];
  for (; fs >= size * 0.5; fs -= 4) {
    ctx.font = `400 ${fs}px ${SERIF}`;
    lines = [];
    let line = "";
    for (const word of text.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxW && line) {
        lines.push(line);
        line = word;
      } else line = test;
    }
    if (line) lines.push(line);
    if (lines.length <= maxLines && lines.every((l) => ctx.measureText(l).width <= maxW)) break;
  }
  lines = lines.slice(0, maxLines).map((l) => clip(ctx, l, maxW));
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const lh = fs * 1.12;
  lines.forEach((l, i) => ctx.fillText(l, cx, y + fs + i * lh));
  return fs + (lines.length - 1) * lh + fs * 0.25;
}

function paperBackground(ctx: CanvasRenderingContext2D, accent: string) {
  const g = ctx.createLinearGradient(0, 0, 0, PIN_H);
  g.addColorStop(0, "#f6f4f0");
  g.addColorStop(1, "#ebe7e1");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, PIN_W, PIN_H);
  ctx.fillStyle = tint(accent, 0.86);
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.arc(PIN_W * 0.98, PIN_H * 0.02, PIN_W * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function strip(ctx: CanvasRenderingContext2D, text: string, y: number, h: number, accent: string) {
  ctx.fillStyle = accent;
  ctx.fillRect(0, y, PIN_W, h);
  ctx.fillStyle = "#fff";
  ctx.font = `800 34px ${SANS}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.letterSpacing = "3px";
  ctx.fillText(clip(ctx, text.toUpperCase(), PIN_W - 80), PIN_W / 2, y + h / 2 + 2);
  ctx.letterSpacing = "0px";
}

/** Layout 1: full-bleed photo with a white title band. */
function drawBand(ctx: CanvasRenderingContext2D, p: PinInput, accent: string) {
  cover(ctx, p.photos[0], 0, 0, PIN_W, 1080);
  shadowed(ctx, 30, -6, 0.18, () => {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 1040, PIN_W, PIN_H - 1040);
  });
  ctx.fillStyle = accent;
  ctx.fillRect(0, 1040, PIN_W, 8);
  eyebrow(ctx, KIND[p.format], PIN_W / 2, 1120);
  headline(ctx, p.title, PIN_W / 2, 1140, PIN_W - 140, 82, 2);
  ctx.fillStyle = MUTED;
  ctx.font = `700 30px ${SANS}`;
  ctx.textAlign = "center";
  ctx.fillText("Instant download", PIN_W / 2, PIN_H - 60);
}

/** Layout 2: headline on paper, photo card, "Instant download" strip. */
function drawHeadline(ctx: CanvasRenderingContext2D, p: PinInput, accent: string) {
  paperBackground(ctx, accent);
  eyebrow(ctx, KIND[p.format], PIN_W / 2, 110);
  const used = headline(ctx, p.title, PIN_W / 2, 130, PIN_W - 120, 96, 3);
  const top = Math.min(130 + used + 50, 520);
  const w = PIN_W - 100;
  const h = Math.min(PIN_H - 150 - top - 60, Math.round((w * p.photos[0].naturalHeight) / p.photos[0].naturalWidth));
  shadowed(ctx, 40, 18, 0.22, () => {
    ctx.fillStyle = "#fff";
    rr(ctx, 50, top, w, h, 28);
    ctx.fill();
  });
  cover(ctx, p.photos[0], 50, top, w, h, 28);
  // Three small ticks under the photo.
  const ticks = p.format === "excel" ? ["Ready to use", "Auto totals", "Easy to edit"] : p.format === "pdf" ? ["Print at home", "A4 + Letter", "Instant access"] : ["Print at home", "Many sizes", "Instant access"];
  const ty = top + h + 50;
  if (ty < PIN_H - 150) {
    ctx.font = `800 28px ${SANS}`;
    const colW = PIN_W / 3;
    ticks.forEach((t, i) => {
      const cx = colW * i + colW / 2;
      const tw = ctx.measureText(t).width;
      check(ctx, cx - tw / 2 - 10, ty, 32, accent);
      ctx.fillStyle = INK;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(t, cx - tw / 2 + 16, ty + 2);
    });
  }
  strip(ctx, STRIP[p.format], PIN_H - 110, 110, accent);
}

/** Layout 3: a collage of 2–3 photos with the title in the middle. */
function drawCollage(ctx: CanvasRenderingContext2D, p: PinInput, accent: string) {
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, PIN_W, PIN_H);
  const [a, b = p.photos[0], c = p.photos[p.photos.length > 1 ? 1 : 0]] = p.photos;
  const gap = 14;
  cover(ctx, a, gap, gap, PIN_W - gap * 2, 600, 18);
  // Title panel.
  const py = 600 + gap * 2;
  ctx.fillStyle = tint(accent, 0.9);
  rr(ctx, gap, py, PIN_W - gap * 2, 330, 18);
  ctx.fill();
  eyebrow(ctx, KIND[p.format], PIN_W / 2, py + 72);
  const titleY = py + 92;
  if (p.title.length <= 28) serifTitle(ctx, p.title, PIN_W / 2, titleY + 110, PIN_W - 140, 96);
  else headline(ctx, p.title, PIN_W / 2, titleY, PIN_W - 140, 76, 2);
  ctx.fillStyle = accent;
  ctx.font = `800 28px ${SANS}`;
  ctx.textAlign = "center";
  ctx.letterSpacing = "3px";
  ctx.fillText("INSTANT DOWNLOAD", PIN_W / 2, py + 300);
  ctx.letterSpacing = "0px";
  const by = py + 330 + gap;
  const bh = PIN_H - by - gap;
  const bw = (PIN_W - gap * 3) / 2;
  cover(ctx, b, gap, by, bw, bh, 18);
  cover(ctx, c, gap * 2 + bw, by, bw, bh, 18);
}

/** Draw one pin. */
export function renderPin(layout: PinLayout, p: PinInput): HTMLCanvasElement {
  const [c, ctx] = canvas(PIN_W, PIN_H);
  const accent = p.accent && /^#[0-9a-f]{6}$/i.test(p.accent) ? p.accent : DEFAULT_ACCENT;
  if (layout === "band") drawBand(ctx, p, accent);
  else if (layout === "headline") drawHeadline(ctx, p, accent);
  else drawCollage(ctx, p, accent);
  return c;
}

/** Every layout as a JPEG blob, ready to preview and download. */
export async function buildPins(p: PinInput): Promise<{ layout: PinLayout; label: string; blob: Blob }[]> {
  const out: { layout: PinLayout; label: string; blob: Blob }[] = [];
  for (const l of PIN_LAYOUTS) out.push({ layout: l.id, label: l.label, blob: await toJpeg(renderPin(l.id, p)) });
  return out;
}

/** A tidy file name, e.g. "toadstool-print-pin-1.jpg". */
export const pinFileName = (title: string, n: number) => `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "pin"}-pin-${n}.jpg`;
