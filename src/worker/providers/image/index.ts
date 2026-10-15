// Swappable image generation. Phase 1 ships only the demo provider;
// OpenAI / Replicate / Ideogram plug in here in Phase 2.

export interface ImageRequest {
  prompt: string;
  /** Deterministic seed — the demo provider uses it to draw the art. */
  seed: number;
  width: number;
  height: number;
}

export interface GeneratedImage {
  /** Demo images are drawn in the browser from `seed`; real ones live in R2 at `r2Key`. */
  kind: "demo" | "r2";
  seed: number;
  r2Key?: string;
  prompt: string;
  /** What the call cost, in pence. */
  costPence: number;
}

export interface ImageProvider {
  id: string;
  name: string;
  generate(req: ImageRequest): Promise<GeneratedImage>;
}

export const demoImageProvider: ImageProvider = {
  id: "demo",
  name: "Demo (free, drawn in your browser)",
  async generate(req) {
    return { kind: "demo", seed: req.seed, prompt: req.prompt, costPence: 0 };
  },
};

export function getImageProvider(id: string): ImageProvider {
  switch (id) {
    case "demo":
    default:
      return demoImageProvider;
  }
}
