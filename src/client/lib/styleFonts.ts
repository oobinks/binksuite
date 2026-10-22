// The design styles' font files (public/fonts), registered with the page on demand so
// the listing photos and the style picker can draw with them.
import type { DesignStyle } from "../../shared/designStyles";

const loaded = new Map<string, Promise<void>>();

/** CSS font family for a style's titles (falls back to the classic serif). */
export const displayFamily = (s: DesignStyle) => (s.id === "classic" ? '"DM Serif Display", Georgia, serif' : `"BS ${s.id} display", "DM Serif Display", Georgia, serif`);

export function loadStyleFonts(s: DesignStyle): Promise<void> {
  if (s.id === "classic") return Promise.resolve();
  let p = loaded.get(s.id);
  if (!p) {
    const faces = [new FontFace(`BS ${s.id} display`, `url(/fonts/${s.display.file})`, { weight: "100 1000" })];
    if (s.body)
      faces.push(
        new FontFace(`BS ${s.id} body`, `url(/fonts/${s.body.regular})`, { weight: "100 599" }),
        new FontFace(`BS ${s.id} body`, `url(/fonts/${s.body.bold})`, { weight: "600 1000" }),
      );
    p = Promise.all(faces.map(async (f) => void document.fonts.add(await f.load()))).then(
      () => undefined,
      () => void loaded.delete(s.id), // falls back to the classic fonts; try again next time
    );
    loaded.set(s.id, p);
  }
  return p;
}
