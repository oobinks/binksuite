// 🎁 Puts a bundle together on your device: one ZIP with each product in its own
// folder (plus a read-me), and a set of bundle listing photos.
import JSZip from "jszip";
import { buyerFileName, loadImageSrc, fileUrl, uploadProductFile, type Deliverable } from "./files";
import { FORMAT_INFO } from "../../shared/format";
import type { BundleSpec } from "../../shared/bundle";
import {
  backdrop,
  badge,
  canvas,
  clip,
  eyebrow,
  featureBar,
  INK,
  loadPhotoFonts,
  MUTED,
  PHOTO_H,
  PHOTO_W,
  plant,
  rr,
  SANS,
  serifTitle,
  shadowed,
  slideTitle,
  toJpeg,
} from "./listingPhotos";

const ACCENT = "#c4703f";

export interface BundlePack {
  zipKey: string;
  /** The bundle ZIP is what buyers download. */
  deliverables: Deliverable[];
  files: string[];
  previews: string[];
  bytes: number;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "bundle";
const folder = (i: number, title: string) => `${i + 1}. ${title.replace(/[\\/:*?"<>|]+/g, "").trim().slice(0, 60)}`;

async function loadImage(key: string | null): Promise<HTMLImageElement | null> {
  if (!key) return null;
  try {
    const src = await loadImageSrc(key);
    const img = new Image();
    img.src = src;
    await img.decode();
    return img;
  } catch {
    return null;
  }
}

/** Draw an image to fill a box (cropping the overflow), centred. */
function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / s;
  const sh = h / s;
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
}

/** Draw a whole image inside a box (no cropping), centred. */
function contain(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const s = Math.min(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * s;
  const dh = img.naturalHeight * s;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

/** A product "card" (its cover photo with a white border), optionally tilted. */
function card(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, title: string, cx: number, cy: number, w: number, h: number, deg = 0) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((deg * Math.PI) / 180);
  shadowed(ctx, 40, 18, 0.28, () => {
    ctx.fillStyle = "#fff";
    rr(ctx, -w / 2, -h / 2, w, h, 18);
    ctx.fill();
  });
  const b = 14;
  ctx.save();
  rr(ctx, -w / 2 + b, -h / 2 + b, w - b * 2, h - b * 2, 10);
  ctx.clip();
  if (img) cover(ctx, img, -w / 2 + b, -h / 2 + b, w - b * 2, h - b * 2);
  else {
    ctx.fillStyle = "#f3e7dc";
    ctx.fillRect(-w / 2 + b, -h / 2 + b, w - b * 2, h - b * 2);
    ctx.fillStyle = INK;
    ctx.font = `900 ${Math.round(h * 0.08)}px ${SANS}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(clip(ctx, title, w - 60), 0, 0);
  }
  ctx.restore();
  ctx.restore();
}

export async function buildBundlePhotos(name: string, bundle: BundleSpec): Promise<Blob[]> {
  await loadPhotoFonts();
  const n = bundle.items.length;
  const images = await Promise.all(bundle.items.map((i) => loadImage(i.cover)));
  const out: Blob[] = [];
  const formats = [...new Set(bundle.items.map((i) => i.format))];

  // 1. Cover: the products fanned out under the bundle's name.
  {
    const [c, ctx] = canvas(PHOTO_W, PHOTO_H);
    backdrop(ctx, ACCENT);
    eyebrow(ctx, `${n}-in-1 bundle`, PHOTO_W / 2, 80);
    const titleY = serifTitle(ctx, name, PHOTO_W / 2, /^the\s/i.test(name) ? 190 : 250, PHOTO_W - 360, 140);
    ctx.fillStyle = ACCENT;
    ctx.font = `900 36px ${SANS}`;
    ctx.textAlign = "center";
    ctx.fillText(clip(ctx, bundle.items.map((i) => i.title).join(" | "), PHOTO_W - 300), PHOTO_W / 2, titleY + 58);
    plant(ctx, 150, 1180, 420);
    const shown = Math.min(n, 5);
    const cw = shown > 3 ? 520 : 600;
    const ch = cw * 0.75;
    const spread = Math.min(440, 1260 / Math.max(1, shown - 1));
    for (let i = 0; i < shown; i++) {
      const off = i - (shown - 1) / 2;
      card(ctx, images[i], bundle.items[i].title, PHOTO_W / 2 + off * spread, 860 + Math.abs(off) * 30, cw, ch, off * 6);
    }
    [`${n} PRODUCTS`, formats.map((f) => FORMAT_INFO[f].label).join(" + "), "BETTER VALUE"].forEach((b, i) => badge(ctx, b, 1860, 520 + i * 180, 74, ACCENT));
    featureBar(ctx, ["Instant download", `${n} products in one`, "Better value"], ACCENT);
    out.push(await toJpeg(c));
  }

  // 2. What's inside: every product with what it is.
  {
    const [c, ctx] = canvas(PHOTO_W, PHOTO_H);
    backdrop(ctx, ACCENT);
    slideTitle(ctx, "What's inside", `${n} products, one download`, "Each one in its own folder, ready to use");
    const cols = n > 4 ? 3 : 2;
    const rows = Math.ceil(Math.min(n, 6) / cols);
    const gap = 46;
    const w = (PHOTO_W - 240 - gap * (cols - 1)) / cols;
    const h = Math.min(520, (PHOTO_H - 380 - gap * (rows - 1)) / rows);
    bundle.items.slice(0, 6).forEach((item, i) => {
      const x = 120 + (i % cols) * (w + gap);
      const y = 330 + Math.floor(i / cols) * (h + gap);
      shadowed(ctx, 30, 12, 0.18, () => {
        ctx.fillStyle = "#fff";
        rr(ctx, x, y, w, h, 24);
        ctx.fill();
      });
      ctx.save();
      rr(ctx, x + 16, y + 16, w - 32, h - 120, 14);
      ctx.clip();
      ctx.fillStyle = "#f3e7dc";
      ctx.fillRect(x + 16, y + 16, w - 32, h - 120);
      if (images[i]) contain(ctx, images[i]!, x + 16, y + 16, w - 32, h - 120);
      ctx.restore();
      ctx.fillStyle = INK;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.font = `900 34px ${SANS}`;
      ctx.fillText(clip(ctx, item.title, w - 60), x + 28, y + h - 60);
      ctx.fillStyle = MUTED;
      ctx.font = `700 26px ${SANS}`;
      ctx.fillText(clip(ctx, `${FORMAT_INFO[item.format].icon} ${FORMAT_INFO[item.format].long}`, w - 60), x + 28, y + h - 24);
    });
    if (n > 6) {
      ctx.fillStyle = MUTED;
      ctx.font = `800 30px ${SANS}`;
      ctx.textAlign = "center";
      ctx.fillText(`+ ${n - 6} more`, PHOTO_W / 2, PHOTO_H - 30);
    }
    out.push(await toJpeg(c));
  }

  // 3+. Each product's own cover, labelled "Included".
  for (const [i, img] of images.entries()) {
    if (!img || out.length >= 10) continue;
    const [c, ctx] = canvas(PHOTO_W, PHOTO_H);
    cover(ctx, img, 0, 0, PHOTO_W, PHOTO_H);
    const label = `INCLUDED · ${i + 1} OF ${n}`;
    ctx.font = `900 40px ${SANS}`;
    const w = ctx.measureText(label).width + 80;
    shadowed(ctx, 16, 6, 0.25, () => {
      ctx.fillStyle = ACCENT;
      rr(ctx, 50, 50, w, 84, 42);
      ctx.fill();
    });
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 90, 94);
    out.push(await toJpeg(c));
  }
  return out;
}

export async function buildBundlePack(productId: string, name: string, bundle: BundleSpec, onProgress: (step: string, fraction: number) => void): Promise<BundlePack> {
  const base = slug(name);
  const zip = new JSZip();
  const files: string[] = [];
  const readMe = [
    `${name}`,
    "",
    `Thank you for your order! This bundle has ${bundle.items.length} products, each in its own folder:`,
    ...bundle.items.map((i, k) => `  ${folder(k, i.title)} (${FORMAT_INFO[i.format].long})`),
    "",
    "Questions? Send us a message on Etsy and we'll be happy to help.",
    "For personal use only. Please don't share or resell the files.",
  ].join("\n");
  zip.file("Read me first.txt", readMe);
  files.push("Read me first.txt");
  for (const [k, item] of bundle.items.entries()) {
    onProgress(`Adding ${item.title}…`, 0.05 + (k / bundle.items.length) * 0.5);
    const res = await fetch(fileUrl(item.zipKey), { credentials: "same-origin" });
    if (!res.ok) throw new Error(`Couldn't load the files for “${item.title}”. Rebuild that product's files first.`);
    const inner = await JSZip.loadAsync(await res.arrayBuffer());
    const dir = folder(k, item.title);
    for (const f of Object.values(inner.files)) {
      // The buyer gets the product, not its listing photos.
      if (f.dir || /listing-photo/i.test(f.name)) continue;
      const name = `${dir}/${f.name.split("/").pop()}`;
      zip.file(name, await f.async("uint8array"));
      files.push(name);
    }
  }
  onProgress("Drawing the bundle's listing photos…", 0.6);
  const photos = await buildBundlePhotos(name, bundle);
  onProgress("Zipping…", 0.75);
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  onProgress("Uploading…", 0.85);
  const stamp = Date.now().toString(36);
  const zipKey = await uploadProductFile(productId, `${base}-bundle-${stamp}.zip`, blob, "application/zip");
  const previews: string[] = [];
  for (const [i, p] of photos.entries()) previews.push(await uploadProductFile(productId, `${base}-listing-${i + 1}-${stamp}.jpg`, p, "image/jpeg"));
  onProgress("Done!", 1);
  return { zipKey, files, previews, deliverables: [{ key: zipKey, name: buyerFileName(name, "", "zip") }], bytes: blob.size };
}
