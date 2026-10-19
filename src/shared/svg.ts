// 🖋️ Vector artwork from Claude arrives as SVG text. Before it's stored or shown it
// goes through this filter: no scripts, no event handlers, no outside links or
// images, sensible size. What's left is pure drawing.

export const SVG_MAX_BYTES = 250_000;
/** Artwork is drawn on a 4:5 canvas (fits 8×10 and A-size prints with a white border). */
export const ART_VIEWBOX = { w: 1000, h: 1250 };

export class SvgError extends Error {
  override name = "SvgError";
}

/**
 * Clean an SVG and return it ready to store, or throw SvgError explaining what's wrong
 * (the message goes back to Claude so the next attempt can fix it).
 */
export function sanitizeSvg(raw: string): string {
  const text = raw.replace(/^﻿/, "");
  const start = text.search(/<svg[\s>]/i);
  const end = text.toLowerCase().lastIndexOf("</svg>");
  if (start < 0 || end < start) throw new SvgError("The answer must be one complete <svg>…</svg> document.");
  let svg = text.slice(start, end + 6);
  if (svg.length > SVG_MAX_BYTES) throw new SvgError(`The SVG is ${Math.round(svg.length / 1000)} KB; keep it under ${SVG_MAX_BYTES / 1000} KB (simplify paths, reuse shapes with <use>).`);

  // Remove anything that could run code or fetch from elsewhere.
  svg = svg
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    .replace(/<\?[\s\S]*?\?>/g, "")
    .replace(/<script[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<script[^>]*\/>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, "")
    .replace(/<(iframe|object|embed|audio|video|animate\w*|set)\b[\s\S]*?(<\/\1\s*>|\/>)/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    // Links: only same-document references (#id) are kept.
    .replace(/\s(xlink:)?href\s*=\s*("(?!#)[^"]*"|'(?!#)[^']*')/gi, "")
    .replace(/url\(\s*(['"]?)(?!#)[^)]*\)/gi, "none")
    .replace(/@import[^;]*;?/gi, "")
    .replace(/javascript:/gi, "");
  if (/<script|<foreignObject|javascript:/i.test(svg)) throw new SvgError("Scripts and embedded HTML aren't allowed in the artwork.");
  // <image> elements can only have pointed somewhere else (their links were removed), so drop them.
  svg = svg.replace(/<image\b[\s\S]*?(<\/image\s*>|\/>)/gi, "");

  // A tidy root: namespace, viewBox, and a large natural size so it prints crisply.
  const rootEnd = svg.indexOf(">");
  let root = svg.slice(0, rootEnd);
  const rest = svg.slice(rootEnd);
  const vb = /viewBox\s*=\s*["']\s*([-\d.]+)[\s,]+([-\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*["']/i.exec(root);
  const w = vb ? Number(vb[3]) : Number(/\swidth\s*=\s*["']?([\d.]+)/i.exec(root)?.[1] ?? ART_VIEWBOX.w);
  const h = vb ? Number(vb[4]) : Number(/\sheight\s*=\s*["']?([\d.]+)/i.exec(root)?.[1] ?? ART_VIEWBOX.h);
  if (!(w > 0 && h > 0)) throw new SvgError("The SVG needs a viewBox, e.g. viewBox=\"0 0 1000 1250\".");
  root = root.replace(/\s(width|height|x|y)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  if (!vb) root += ` viewBox="0 0 ${w} ${h}"`;
  if (!/\sxmlns\s*=/.test(root)) root += ' xmlns="http://www.w3.org/2000/svg"';
  const scale = 3000 / Math.max(w, h);
  root += ` width="${Math.round(w * scale)}" height="${Math.round(h * scale)}"`;
  svg = root + rest;

  // Must actually draw something.
  if (!/<(path|rect|circle|ellipse|polygon|polyline|line|text|use|g)\b/i.test(svg)) throw new SvgError("The SVG doesn't draw anything.");
  return svg;
}
