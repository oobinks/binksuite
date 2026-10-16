// Print sizes and their pixel dimensions (tiny module so screens can show them without loading the PDF tools).
export interface PrintSize {
  name: string;
  /** width × height in inches (portrait) */
  inches: [number, number];
}

export const PRINT_SIZES: PrintSize[] = [
  { name: "A5", inches: [148 / 25.4, 210 / 25.4] },
  { name: "A4", inches: [210 / 25.4, 297 / 25.4] },
  { name: "A3", inches: [297 / 25.4, 420 / 25.4] },
  { name: "US Letter", inches: [8.5, 11] },
  { name: "8x10", inches: [8, 10] },
];

/** Phones (iPhone especially) refuse canvases above ~16.7 million pixels. */
const MAX_CANVAS_PIXELS = 16_000_000;
const TARGET_DPI = 300;

export function pixelsFor(size: PrintSize): { w: number; h: number; dpi: number } {
  const [wi, hi] = size.inches;
  const dpi = Math.min(TARGET_DPI, Math.floor(Math.sqrt(MAX_CANVAS_PIXELS / (wi * hi))));
  return { w: Math.round(wi * dpi), h: Math.round(hi * dpi), dpi };
}

