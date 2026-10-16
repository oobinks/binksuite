// The Printer's heavy lifting happens on YOUR device (free, and the Worker's
// 10 ms CPU limit would never manage it): enlarge each kept image to print
// sizes at 300 DPI, make one PDF per size, zip everything, upload to R2.
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import { fileUrl, loadImageSrc } from "./files";
import { PRINT_SIZES, pixelsFor } from "./printSizes";

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "print";

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't read one of the images"));
    img.src = src;
  });
}

function toJpeg(canvas: HTMLCanvasElement, quality = 0.9): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? b.arrayBuffer().then(resolve, reject) : reject(new Error("Your device ran out of memory making a print file"))), "image/jpeg", quality),
  );
}

const SLOGAN_FONT = "Nunito";
const SLOGAN_INK = "#3b2f2a";

/**
 * Draw the art centred on a white page with a small border (fits any paper shape).
 * With a slogan, the art moves up and the slogan is set underneath as real text,
 * so it's always spelled exactly as you typed it.
 */
export function renderPage(img: HTMLImageElement, w: number, h: number, slogan?: string | null, canvas?: HTMLCanvasElement): HTMLCanvasElement {
  const c = canvas ?? document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const margin = Math.round(Math.min(w, h) * 0.05);
  const text = slogan?.trim();
  const band = text ? Math.round(h * 0.16) : 0;
  const scale = Math.min((w - margin * 2) / img.naturalWidth, (h - margin * 2 - band) / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  const top = (h - band - dh) / 2;
  ctx.drawImage(img, (w - dw) / 2, top, dw, dh);
  if (text) {
    // Biggest size that fits the width, capped so short slogans don't shout.
    let size = Math.round(band * 0.42);
    const maxWidth = dw * 0.95;
    ctx.font = `900 ${size}px ${SLOGAN_FONT}, sans-serif`;
    while (ctx.measureText(text).width > maxWidth && size > 8) {
      size -= Math.max(1, Math.round(size * 0.05));
      ctx.font = `900 ${size}px ${SLOGAN_FONT}, sans-serif`;
    }
    ctx.fillStyle = SLOGAN_INK;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, w / 2, top + dh + (h - (top + dh) - margin) / 2);
  }
  return c;
}

/** Make sure the slogan font is ready before drawing with it. */
export async function loadSloganFont() {
  try {
    await document.fonts.load(`900 64px ${SLOGAN_FONT}`);
  } catch {
    /* falls back to the system sans-serif */
  }
}

export interface PrintPack {
  zipKey: string;
  files: string[];
  bytes: number;
}

export async function buildPrintPack(
  productId: string,
  title: string,
  imageKeys: string[],
  onProgress: (step: string, fraction: number) => void,
  slogan?: string | null,
): Promise<PrintPack> {
  if (!imageKeys.length) throw new Error("There are no kept images to print.");
  const base = slug(title);
  const zip = new JSZip();
  const files: string[] = [];

  onProgress("Loading your art…", 0.02);
  if (slogan) await loadSloganFont();
  const images = await Promise.all(imageKeys.map(async (k) => loadImg(await loadImageSrc(k))));

  // Originals, handy as listing photos.
  for (let i = 0; i < imageKeys.length; i++) {
    const c = document.createElement("canvas");
    c.width = images[i].naturalWidth;
    c.height = images[i].naturalHeight;
    c.getContext("2d")!.drawImage(images[i], 0, 0);
    const name = `${base}-art-${i + 1}.jpg`;
    zip.file(name, await toJpeg(c, 0.95));
    files.push(name);
  }

  const total = PRINT_SIZES.length * images.length;
  let done = 0;
  for (const size of PRINT_SIZES) {
    const { w, h, dpi } = pixelsFor(size);
    const pdf = await PDFDocument.create();
    pdf.setTitle(`${title} (${size.name})`);
    pdf.setCreator("BinkSuite");
    for (const img of images) {
      onProgress(`Printing ${size.name} at ${dpi} DPI…`, 0.05 + (0.85 * done) / total);
      const jpg = await pdf.embedJpg(await toJpeg(renderPage(img, w, h, slogan)));
      // PDF pages are measured in points (72 per inch).
      const page = pdf.addPage([size.inches[0] * 72, size.inches[1] * 72]);
      page.drawImage(jpg, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
      done++;
      await new Promise((r) => setTimeout(r, 0)); // let the page breathe
    }
    const name = `${base}-${size.name.replace(/\s+/g, "")}.pdf`;
    zip.file(name, await pdf.save());
    files.push(name);
  }

  onProgress("Zipping…", 0.92);
  const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
  onProgress(`Uploading ${(blob.size / 1024 / 1024).toFixed(1)} MB…`, 0.95);
  const zipName = `${base}-print-pack-${Date.now().toString(36)}.zip`;
  const res = await fetch(fileUrl(`products/${productId}/${zipName}`), {
    method: "PUT",
    credentials: "same-origin",
    headers: { "content-type": "application/zip" },
    body: blob,
  });
  if (!res.ok) {
    const msg = await res.json().catch(() => null);
    throw new Error(msg?.error ?? `Upload failed (${res.status})`);
  }
  const { key } = (await res.json()) as { key: string };
  onProgress("Done!", 1);
  return { zipKey: key, files, bytes: blob.size };
}
