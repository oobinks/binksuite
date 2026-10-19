// 🎁 Bundles: what you could bundle (with ideas), and making one.
import { z } from "zod";
import { newApp, body, HttpError } from "../app";
import { EngineError } from "../engine/queue";
import { bundleCandidates, createBundle } from "../engine/bundles";
import { BUNDLE_MAX, BUNDLE_MIN } from "../../shared/bundle";

export const bundleRoutes = newApp()
  .get("/bundles", async (c) => c.json(await bundleCandidates(c.get("db"))))
  .post("/bundles", async (c) => {
    const b = await body(
      c,
      z.object({
        name: z.string().min(3).max(80),
        ids: z.array(z.string().max(40)).min(BUNDLE_MIN).max(BUNDLE_MAX),
        savePercent: z.number().min(5).max(70),
        theme: z.string().max(40).optional(),
      }),
    );
    try {
      const p = await createBundle(c.get("db"), b);
      return c.json({ ok: true, productId: p.id });
    } catch (e) {
      if (e instanceof EngineError) throw new HttpError(e.status, e.message);
      throw e;
    }
  });
