import { describe, expect, it } from "vitest";
import { researchIdea } from "../../src/worker/engine/agents/marketResearch";

describe("market research for suggested ideas", () => {
  it("is stable for the same idea", () => {
    const a = researchIdea("Cottagecore mushroom wall art");
    const b = researchIdea("cottagecore   mushroom wall art");
    expect({ ...a, idea: "", summary: "" }).toEqual({ ...b, idea: "", summary: "" });
  });
  it("always skips trademarked ideas and says why", () => {
    const r = researchIdea("Disney princess nursery prints");
    expect(r.verdict).toBe("skip");
    expect(r.risks.join(" ")).toMatch(/disney/i);
  });
  it("flags seasonality and text-heavy designs", () => {
    const r = researchIdea("Christmas gift tag labels");
    expect(r.seasonality).toMatch(/Oct–Dec/);
    expect(r.risks.join(" ")).toMatch(/spelling/);
  });
  it("produces Etsy-sized keywords, angles and a sensible price range", () => {
    const r = researchIdea("Watercolour frog prints");
    expect(r.keywords.length).toBeGreaterThan(3);
    for (const k of r.keywords) expect(k.length).toBeLessThanOrEqual(20);
    expect(r.angles).toHaveLength(3);
    expect(r.priceRangePence[1]).toBeGreaterThan(r.priceRangePence[0]);
    expect(["go", "maybe", "skip"]).toContain(r.verdict);
  });
});
