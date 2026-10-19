// 🖼️ Draws a photo-style mockup on your device: the AI-painted room or desk, with your
// design placed in a real-looking frame (shadow, mat, glass sheen) or on a laptop,
// tablet or printed page. Output is a 2000 × 1500 picture, ready for Etsy.
import { loadImageSrc } from "./files";
import { loadSloganFont, renderPage } from "./print";
import { SCENES, type MockupView, type SceneDef } from "../../shared/mockupScenes";

export const MOCKUP_W = 2000;
export const MOCKUP_H = 1500;

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't load a picture for the mockup"));
    img.src = src;
  });
}

/** Draw an image to fill a box (cropping the overflow), anchored to the top for screens. */
function cover(ctx: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, x: number, y: number, w: number, h: number, top = false) {
  const iw = (img as HTMLImageElement).naturalWidth || img.width;
  const ih = (img as HTMLImageElement).naturalHeight || img.height;
  const s = Math.max(w / iw, h / ih);
  const sw = w / s;
  const sh = h / s;
  ctx.drawImage(img, (iw - sw) / 2, top ? 0 : (ih - sh) / 2, sw, sh, x, y, w, h);
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Without a painted background: a soft, warm studio backdrop. */
function plainBackdrop(ctx: CanvasRenderingContext2D, scene: SceneDef) {
  const g = ctx.createLinearGradient(0, 0, 0, MOCKUP_H);
  const wall = scene.kind === "frame" || scene.kind === "gallery";
  g.addColorStop(0, wall ? "#f3ece2" : "#efe6da");
  g.addColorStop(wall ? 0.72 : 1, wall ? "#e9dfd2" : "#e3d6c4");
  if (wall) g.addColorStop(0.72, "#c9a77f");
  if (wall) g.addColorStop(1, "#b48e66");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, MOCKUP_W, MOCKUP_H);
}

/** A soft light from the top left, so everything sits in the same room. */
function lightWash(ctx: CanvasRenderingContext2D) {
  const g = ctx.createRadialGradient(MOCKUP_W * 0.2, MOCKUP_H * 0.1, 50, MOCKUP_W * 0.4, MOCKUP_H * 0.4, MOCKUP_W);
  g.addColorStop(0, "rgba(255,248,235,0.18)");
  g.addColorStop(1, "rgba(0,0,0,0.06)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, MOCKUP_W, MOCKUP_H);
}

const FRAME_COLOURS = {
  oak: ["#c89b6a", "#a97a4b", "#8a5f37"],
  white: ["#ffffff", "#f1efea", "#dcd8d0"],
  black: ["#3a3533", "#211e1d", "#141212"],
};

/** A framed print: drop shadow, moulding with bevel light, white mat, the print, a touch of glass glare. */
function drawFrame(ctx: CanvasRenderingContext2D, print: HTMLCanvasElement, x: number, y: number, w: number, h: number, colour: keyof typeof FRAME_COLOURS) {
  const border = w * 0.055;
  const [light, mid, dark] = FRAME_COLOURS[colour];
  ctx.save();
  ctx.shadowColor = "rgba(40,28,18,0.38)";
  ctx.shadowBlur = w * 0.08;
  ctx.shadowOffsetX = w * 0.025;
  ctx.shadowOffsetY = w * 0.045;
  ctx.fillStyle = mid;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
  // Moulding: lighter top/left edges, darker bottom/right.
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, light);
  g.addColorStop(0.5, mid);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  // Mat and print.
  const mx = x + border;
  const my = y + border;
  const mw = w - border * 2;
  const mh = h - border * 2;
  ctx.fillStyle = "#fbfaf7";
  ctx.fillRect(mx, my, mw, mh);
  const pad = mw * 0.08;
  cover(ctx, print, mx + pad, my + pad, mw - pad * 2, mh - pad * 2);
  // Inner shadow where the moulding meets the mat.
  const inner = ctx.createLinearGradient(mx, my, mx, my + mh * 0.06);
  inner.addColorStop(0, "rgba(0,0,0,0.18)");
  inner.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = inner;
  ctx.fillRect(mx, my, mw, mh * 0.06);
  // Glass sheen.
  const glare = ctx.createLinearGradient(mx, my, mx + mw, my + mh);
  glare.addColorStop(0, "rgba(255,255,255,0.16)");
  glare.addColorStop(0.35, "rgba(255,255,255,0)");
  glare.addColorStop(1, "rgba(255,255,255,0.04)");
  ctx.fillStyle = glare;
  ctx.fillRect(mx, my, mw, mh);
}

function drawLaptop(ctx: CanvasRenderingContext2D, screen: HTMLImageElement) {
  const w = MOCKUP_W * 0.56;
  const h = w * 0.64;
  const x = (MOCKUP_W - w) / 2;
  const y = MOCKUP_H * 0.16;
  ctx.save();
  ctx.shadowColor = "rgba(30,20,10,0.35)";
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 30;
  ctx.fillStyle = "#1d1d1f";
  rr(ctx, x, y, w, h, 28);
  ctx.fill();
  ctx.restore();
  const bez = w * 0.025;
  ctx.fillStyle = "#fff";
  ctx.fillRect(x + bez, y + bez, w - bez * 2, h - bez * 2.4);
  cover(ctx, screen, x + bez, y + bez, w - bez * 2, h - bez * 2.4, true);
  // Base.
  const by = y + h;
  const g = ctx.createLinearGradient(0, by, 0, by + 40);
  g.addColorStop(0, "#d9d9de");
  g.addColorStop(1, "#9a9aa2");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x - w * 0.08, by);
  ctx.lineTo(x + w * 1.08, by);
  ctx.lineTo(x + w * 1.04, by + 40);
  ctx.lineTo(x - w * 0.04, by + 40);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#8a8a92";
  rr(ctx, x + w * 0.43, by, w * 0.14, 12, 6);
  ctx.fill();
}

function drawTablet(ctx: CanvasRenderingContext2D, screen: HTMLImageElement) {
  const h = MOCKUP_H * 0.78;
  const w = h * 0.75;
  ctx.save();
  ctx.translate(MOCKUP_W / 2, MOCKUP_H / 2);
  ctx.rotate((-6 * Math.PI) / 180);
  ctx.shadowColor = "rgba(30,20,10,0.35)";
  ctx.shadowBlur = 70;
  ctx.shadowOffsetX = 25;
  ctx.shadowOffsetY = 35;
  ctx.fillStyle = "#222224";
  rr(ctx, -w / 2, -h / 2, w, h, 60);
  ctx.fill();
  ctx.shadowColor = "transparent";
  const bez = w * 0.05;
  ctx.fillStyle = "#fff";
  rr(ctx, -w / 2 + bez, -h / 2 + bez, w - bez * 2, h - bez * 2, 22);
  ctx.fill();
  ctx.save();
  rr(ctx, -w / 2 + bez, -h / 2 + bez, w - bez * 2, h - bez * 2, 22);
  ctx.clip();
  cover(ctx, screen, -w / 2 + bez, -h / 2 + bez, w - bez * 2, h - bez * 2, true);
  ctx.restore();
  ctx.restore();
}

function drawPaper(ctx: CanvasRenderingContext2D, page: HTMLImageElement) {
  const h = MOCKUP_H * 0.84;
  const w = h / 1.414;
  ctx.save();
  ctx.translate(MOCKUP_W / 2, MOCKUP_H / 2);
  ctx.rotate((-4 * Math.PI) / 180);
  ctx.shadowColor = "rgba(30,20,10,0.3)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetX = 18;
  ctx.shadowOffsetY = 26;
  ctx.fillStyle = "#fff";
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.shadowColor = "transparent";
  cover(ctx, page, -w / 2, -h / 2, w, h, true);
  // Slight paper shading.
  const g = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  g.addColorStop(0, "rgba(255,255,255,0.05)");
  g.addColorStop(1, "rgba(0,0,0,0.05)");
  ctx.fillStyle = g;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.restore();
}

/** Draw one mockup to a canvas. */
export async function renderMockup(view: MockupView): Promise<HTMLCanvasElement> {
  const scene = SCENES[view.scene] ?? SCENES.living;
  const c = document.createElement("canvas");
  c.width = MOCKUP_W;
  c.height = MOCKUP_H;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  const [bg, content] = await Promise.all([
    view.bgKey ? loadImageSrc(view.bgKey).then(loadImg).catch(() => null) : null,
    view.imageKey ? loadImageSrc(view.imageKey).then(loadImg).catch(() => null) : null,
  ]);
  if (bg) {
    // Walls: keep the top of the painting (the empty wall); desks: keep the middle.
    cover(ctx, bg, 0, 0, MOCKUP_W, MOCKUP_H, scene.kind === "frame" || scene.kind === "gallery");
  } else plainBackdrop(ctx, scene);
  if (!content) return c;

  if (scene.kind === "frame" || scene.kind === "gallery") {
    if (view.slogan) await loadSloganFont();
    const print = renderPage(content, 1050, 1485, view.slogan); // an A-size print, like the real files
    if (scene.kind === "frame") {
      const h = MOCKUP_H * 0.5;
      const w = h / 1.414 + h * 0.11;
      drawFrame(ctx, print, (MOCKUP_W - w) / 2, MOCKUP_H * 0.08, w, h, scene.frame ?? "oak");
    } else {
      const h = MOCKUP_H * 0.38;
      const w = h / 1.414 + h * 0.11;
      const gap = w * 0.22;
      const left = (MOCKUP_W - (w * 3 + gap * 2)) / 2;
      for (let i = 0; i < 3; i++) drawFrame(ctx, print, left + i * (w + gap), MOCKUP_H * (i === 1 ? 0.07 : 0.12), w, h, i === 1 ? "oak" : (scene.frame ?? "black"));
    }
  } else if (scene.kind === "laptop") drawLaptop(ctx, content);
  else if (scene.kind === "tablet") drawTablet(ctx, content);
  else drawPaper(ctx, content);
  lightWash(ctx);
  return c;
}

/** A finished mockup as a picture (for showing and saving). */
export async function mockupBlob(view: MockupView): Promise<Blob> {
  const c = await renderMockup(view);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't save the mockup"))), "image/jpeg", 0.9));
}
