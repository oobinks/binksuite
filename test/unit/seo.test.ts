import { describe, expect, it } from "vitest";
import { cleanPhrase, fitTitle, phrasesFromListings, seoCheck } from "../../src/shared/seo";

const listings = [
  { title: "Monthly Budget Spreadsheet | Excel & Google Sheets Budget Planner | Bill Tracker", tags: ["budget spreadsheet", "budget planner", "Bill Tracker", "digital download"], favourites: 900 },
  { title: "Budget Planner Spreadsheet, Bill Tracker, Savings Tracker", tags: ["budget spreadsheet", "savings tracker", "excel budget", "digital download"], favourites: 300 },
  { title: "Simple Budget Spreadsheet for Google Sheets | Bill Tracker", tags: ["budget spreadsheet", "budget planner", "paycheck budget"], favourites: 40 },
  { title: "Debt Snowball Tracker | Budget Planner", tags: ["debt tracker", "budget planner"], favourites: 5 },
];

describe("search phrases", () => {
  it("ranks what the top listings share, from tags and titles", () => {
    const phrases = phrasesFromListings(listings);
    const names = phrases.map((p) => p.phrase);
    expect(names.slice(0, 2)).toEqual(["budget planner", "budget spreadsheet"]);
    expect(phrases.find((p) => p.phrase === "budget spreadsheet")).toMatchObject({ listings: 3, favs: 1240 });
    expect(names).toContain("bill tracker"); // from titles (3 listings) and a tag
    expect(names).not.toContain("digital download"); // generic
    expect(names).not.toContain("paycheck budget"); // only one listing
    expect(names.every((n) => n.length <= 20)).toBe(true);
  });

  it("trims titles at a phrase boundary, never mid-word", () => {
    const long = "Monthly Budget Spreadsheet | Excel and Google Sheets Budget Planner | Bill Tracker | Debt Payoff Tracker | Savings Goal Tracker | Paycheck Budget";
    const t = fitTitle(long);
    expect(t.length).toBeLessThanOrEqual(140);
    expect(t.endsWith("Savings Goal Tracker")).toBe(true);
    expect(fitTitle("A  |B|  C")).toBe("A | B | C");
    expect(cleanPhrase("Bill &amp; Debt Tracker!")).toBe("bill & debt tracker");
  });
});

describe("listing check", () => {
  const research = { keyword: "budget spreadsheet", source: "etsy" as const, competing: 5000, phrases: phrasesFromListings(listings), checkedAt: "" };
  it("passes a well-written listing", () => {
    const { score, checks } = seoCheck(
      {
        title: "Budget Spreadsheet | Monthly Budget Planner for Excel & Google Sheets | Bill Tracker | Savings Tracker | Debt Payoff",
        tags: ["budget spreadsheet", "budget planner", "bill tracker", "savings tracker", "excel budget", "debt tracker", "monthly budget", "google sheets", "finance planner", "paycheck budget", "expense tracker", "budget template", "money planner"],
        description: "This budget spreadsheet was designed with AI assistance and checked by hand.\n\n✦ WHAT'S INCLUDED\n• x\n\n✦ HOW IT WORKS\n1. y",
      },
      research,
    );
    expect(checks.filter((c) => !c.pass).map((c) => c.key)).toEqual([]);
    expect(score).toBe(100);
  });
  it("spots the usual mistakes", () => {
    const { score, checks } = seoCheck({ title: "BEAUTIFUL Budget budget budget spreadsheet", tags: ["budget", "spreadsheet"], description: "Nice." }, research);
    const failed = checks.filter((c) => !c.pass).map((c) => c.key);
    expect(failed).toEqual(expect.arrayContaining(["length", "repeat", "caps", "tags", "longtail", "searches", "opening", "sections"]));
    expect(score).toBeLessThan(30);
  });
});
