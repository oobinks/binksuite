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

import { tidyListing, cleanKeywords, verdictFrom } from "../../src/worker/engine/agents/real";

describe("real listing tidy-up", () => {
  it("enforces Etsy limits, strips blocked brands and adds the AI disclosure", () => {
    const l = tidyListing({ title: "x".repeat(200) + " Disney", tags: Array(20).fill("tag").map((t, i) => `${t} ${i}`), description: "Nice print." }, ["disney"]);
    expect(l.title.length).toBeLessThanOrEqual(140);
    expect(l.title).not.toMatch(/disney/i);
    expect(l.tags.length).toBeLessThanOrEqual(13);
    expect(l.description).toMatch(/^This design was created with AI assistance/);
    expect(l.description).toMatch(/digital download/);
  });
  it("keeps an existing disclosure", () => {
    const l = tidyListing({ title: "T", tags: ["a"], description: "Made with AI. Digital download." }, []);
    expect(l.description.startsWith("Made with AI")).toBe(true);
  });
  it("cleans keywords and decides verdicts", () => {
    expect(cleanKeywords(["Mushroom Wall Art!", "mushroom wall art", "a very very very long keyword"])).toEqual(["mushroom wall art", "a very very very lon"]);
    expect(verdictFrom(8, false)).toBe("go");
    expect(verdictFrom(9, true)).toBe("skip");
  });
});
