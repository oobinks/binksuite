import { describe, expect, it } from "vitest";
import { checkListing, compliancePasses, hasAiDisclosure, blockedTermsIn } from "../../src/shared/compliance";

const good = {
  title: "Cosy Autumn Print Set | Printable Wall Art",
  tags: ["autumn print", "wall art", "printable"],
  description: "This design was created with AI assistance and checked by hand.\n\nWhat's included…",
  designedBy: "seller" as const,
  imagesConfirmed: true,
  providerLicenceOk: true,
};

describe("compliance rules", () => {
  it("passes a clean listing", () => {
    expect(compliancePasses(checkListing(good))).toBe(true);
  });
  it("requires the AI disclosure in the first paragraph only", () => {
    expect(hasAiDisclosure("Made with AI.\n\nMore")).toBe(true);
    expect(hasAiDisclosure("Lovely print.\n\nThis is AI-generated.")).toBe(false);
    const checks = checkListing({ ...good, description: "Lovely print.\n\nAI-generated art." });
    expect(checks.find((c) => c.id === "ai-disclosure")!.pass).toBe(false);
    expect(compliancePasses(checks)).toBe(false);
  });
  it("enforces Etsy's title and tag limits", () => {
    const c = checkListing({ ...good, title: "x".repeat(141), tags: Array(14).fill("ok"), description: good.description });
    expect(c.find((x) => x.id === "title-length")!.pass).toBe(false);
    expect(c.find((x) => x.id === "tag-count")!.pass).toBe(false);
    const long = checkListing({ ...good, tags: ["this tag is far too long for etsy"] });
    expect(long.find((x) => x.id === "tag-length")!.pass).toBe(false);
  });
  it("catches blocklisted brands as whole words", () => {
    expect(blockedTermsIn("Disney-style princess")).toEqual(["disney"]);
    expect(blockedTermsIn("barbecue party")).toEqual([]);
    expect(blockedTermsIn("A Harry Potter fan")).toEqual(["harry potter"]);
  });
  it("treats image confirmation and licence as warnings, not blockers", () => {
    const c = checkListing({ ...good, imagesConfirmed: false, providerLicenceOk: false });
    expect(compliancePasses(c)).toBe(true);
  });
  it("requires Designed by = seller", () => {
    expect(compliancePasses(checkListing({ ...good, designedBy: "" }))).toBe(false);
  });
});

describe("Etsy AI rules (October 2026)", () => {
  it("spots functional guides but leaves planners, trackers and art alone", async () => {
    const { functionalGuideIn } = await import("../../src/shared/compliance");
    for (const t of ["Sourdough recipe book", "Crochet pattern for a bunny", "Beginner knitting patterns", "Watercolour tutorial", "How-to guide for decluttering", "12 week workout plan"])
      expect(functionalGuideIn(t), t).not.toBeNull();
    for (const t of ["Meal planner printable", "Monthly budget spreadsheet", "Geometric pattern wall art", "Workout tracker", "Grocery list", "Habit tracker"])
      expect(functionalGuideIn(t), t).toBeNull();
  });

  it("knows when a description says how the photos were made", async () => {
    const { hasPhotoNote, PHOTO_NOTE } = await import("../../src/shared/compliance");
    expect(hasPhotoNote(`Lovely print.\n\n${PHOTO_NOTE.art}`)).toBe(true);
    expect(hasPhotoNote(PHOTO_NOTE.excel)).toBe(true);
    expect(hasPhotoNote("Lovely print. Frames aren't included.")).toBe(false);
  });
});
