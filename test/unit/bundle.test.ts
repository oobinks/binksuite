import { describe, expect, it } from "vitest";
import { bundleFormat, bundleIdeas, bundleKeyword, savingPercent } from "../../src/shared/bundle";
import { withSaving } from "../../src/worker/engine/agents";

const c = (id: string, title: string, tags: string[], format: "art" | "excel" | "pdf" = "excel") => ({ id, title, tags, format, pricePence: 400, cover: null, live: true });

describe("bundles", () => {
  it("groups products by what they're about, not what they're made as", () => {
    const ideas = bundleIdeas([
      c("a", "Christmas Gift Tracker", ["christmas gifts", "gift tracker excel"]),
      c("b", "Christmas Meal Planner", ["christmas dinner", "printable planner"], "pdf"),
      c("c", "Monthly Budget Spreadsheet", ["budget spreadsheet", "excel template"]),
      c("d", "Weekly Budget Planner", ["budget planner"], "pdf"),
      c("e", "Frog Print", ["frog wall art"], "art"),
    ]);
    expect(ideas.map((i) => [i.name, i.ids])).toEqual([
      ["The Budget Bundle", ["c", "d"]],
      ["The Christmas Bundle", ["a", "b"]],
    ]);
  });
  it("works out the format, keyword and an honest saving", () => {
    expect(bundleFormat([{ format: "pdf" }, { format: "excel" }])).toBe("excel");
    expect(bundleFormat([{ format: "art" }, { format: "art" }])).toBe("art");
    expect(bundleKeyword({ items: [], savePercent: 30, theme: "Budget" }, "excel")).toBe("budget spreadsheet bundle");
    expect(savingPercent(1000, 699)).toBe(30);
    const l = withSaving({ description: "Intro\n\n✦ PLEASE NOTE\n• x" }, 1000, 699);
    expect(l.description).toBe("Intro\n\n✦ BETTER VALUE\nBought separately, these cost £10.00. As a bundle: £6.99 (save 30%).\n\n✦ PLEASE NOTE\n• x");
    expect(withSaving({ description: "d" }, 500, 600).description).toBe("d");
  });
});
