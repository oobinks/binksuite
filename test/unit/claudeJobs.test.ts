import { describe, expect, it } from "vitest";
import { describeJob } from "../../src/shared/claudeJobs";

describe("Claude bar job descriptions", () => {
  it("says what Claude is doing, and for which product", () => {
    expect(describeJob({ title: "Research your idea: Christmas gift tracker", kind: "json" })).toBe("🔬 Researching the market for “Christmas gift tracker”");
    expect(describeJob({ title: "🔍 Design review: The Ultimate Budget", kind: "json" })).toBe("🔍 Reviewing and polishing the design of “The Ultimate Budget”");
    expect(describeJob({ title: "Write listing: The Ultimate Budget", kind: "json" })).toBe("✍️ Writing the Etsy title, tags and description for “The Ultimate Budget”");
    expect(describeJob({ title: "🎯 Today's ideas (5)", kind: "json" })).toBe("🎯 Coming up with today's product ideas");
    expect(describeJob({ title: "Something new", kind: "svg" })).toBe("🎨 Something new");
  });
});
