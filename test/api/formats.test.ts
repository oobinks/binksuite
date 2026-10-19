// 🧺 Products we make: switch a kind of product off and the shop stops suggesting it.
import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { getDb } from "../../src/worker/db";
import { getSettings } from "../../src/worker/lib/store";
import { suggestIdea } from "../../src/worker/engine/queue";
import { pickFormat } from "../../src/shared/format";
import { setUpOwner } from "./helpers";

describe("product kinds", () => {
  it("keeps at least one kind on, and turns new ideas into a kind that's switched on", async () => {
    const owner = await setUpOwner();
    expect((await owner.put("/api/settings", { formats: { art: false, excel: false, pdf: false } })).status).toBe(400);
    expect((await owner.put("/api/settings", { formats: { art: false, excel: true, pdf: true } })).status).toBe(200);
    const db = getDb(env.DB);
    const settings = await getSettings(db);
    expect(settings.formats).toEqual({ art: false, excel: true, pdf: true });
    const frog = await suggestIdea(db, settings, "Frog wall art for nurseries", undefined, true);
    expect((frog.data as { format: string }).format).toBe("pdf");
    const asked = await suggestIdea(db, settings, "Anything", undefined, true, { format: "art" });
    expect((asked.data as { format: string }).format).toBe("pdf");
    const budget = await suggestIdea(db, settings, "Monthly budget", undefined, true);
    expect((budget.data as { format: string }).format).toBe("excel");
  });

  it("picks the closest kind that's on", () => {
    expect(pickFormat("art", { art: false, excel: true, pdf: true })).toBe("pdf");
    expect(pickFormat("excel", { art: true, excel: false, pdf: true })).toBe("pdf");
    expect(pickFormat("pdf", { art: true, excel: false, pdf: false })).toBe("art");
    expect(pickFormat("excel", { art: true, excel: true, pdf: true })).toBe("excel");
  });
});
