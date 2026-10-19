import { describe, expect, it } from "vitest";
import { isStaleBuild } from "../../src/shared/staleBuild";

describe("old tab after an update", () => {
  it("recognises every browser's 'that file is gone' error, and nothing else", () => {
    expect(isStaleBuild(new TypeError("Failed to fetch dynamically imported module: https://x/assets/sheet-D8FqV4QH.js"))).toBe(true); // Chrome
    expect(isStaleBuild(new TypeError("Importing a module script failed."))).toBe(true); // Safari
    expect(isStaleBuild(new TypeError("error loading dynamically imported module: https://x/a.js"))).toBe(true); // Firefox
    expect(isStaleBuild(new Error("Upload failed (413)"))).toBe(false);
    expect(isStaleBuild(null)).toBe(false);
  });
});
