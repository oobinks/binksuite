import { describe, expect, it } from "vitest";
import { autoStyle, pickStyle, STYLE_IDS, styleOf } from "../../src/shared/designStyles";

describe("design styles", () => {
  it("gives the same product the same style", () => {
    expect(autoStyle(12345)).toBe(autoStyle(12345));
    expect(STYLE_IDS).toContain(autoStyle("abc"));
  });

  it("spreads styles across products", () => {
    const seen = new Set(Array.from({ length: 60 }, (_, i) => autoStyle(i * 7919)));
    expect(seen.size).toBe(STYLE_IDS.length);
  });

  it("avoids the styles of the last few products", () => {
    for (let seed = 0; seed < 40; seed++) {
      const recent = [autoStyle(seed), STYLE_IDS[0], STYLE_IDS[1]];
      expect(recent).not.toContain(pickStyle(seed, recent));
    }
    // Even when every style was used lately there's still an answer.
    expect(STYLE_IDS).toContain(pickStyle(1, [...STYLE_IDS]));
  });

  it("falls back to the classic look for unknown styles", () => {
    expect(styleOf(undefined).id).toBe("classic");
    expect(styleOf("nope").id).toBe("classic");
    expect(styleOf("bold").id).toBe("bold");
  });
});
