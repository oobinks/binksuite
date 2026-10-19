import { describe, expect, it } from "vitest";
import { colLetter, columnFormula, summaryCells, summaryFormula, tidySheetSpec, TAB_FIRST_ROW } from "../../src/shared/sheetSpec";
import { formatOf, guessFormat } from "../../src/shared/format";

const christmas = {
  title: "Christmas Gift Tracker",
  subtitle: "Every present, every penny",
  accent: "#c0392b",
  howTo: ["Type your budget on the Summary tab", "Add each gift"],
  inputs: [{ label: "Christmas budget", type: "money", example: 400 }],
  tabs: [
    {
      name: "Gifts",
      columns: [
        { header: "Person", type: "text" },
        { header: "Gift idea", type: "text" },
        { header: "Budget", type: "money" },
        { header: "Spent", type: "money" },
        { header: "Left", type: "money", formula: "{Budget} - {Spent}" },
        { header: "Bought?", type: "checkbox" },
        { header: "Where", type: "choice", options: ["Online", "In store"] },
      ],
      exampleRows: [["Mum", "Cosy socks", 25, 18, 999, "yes", "online"]],
      blankRows: 30,
    },
  ],
  summary: [
    { label: "Total spent", formula: "SUM(Gifts[Spent])", type: "money" },
    { label: "Left to spend", formula: "{input:Christmas budget} - [Total spent]", type: "money" },
    { label: "Gifts bought", formula: 'COUNTIF(Gifts[Bought?], "Yes")', type: "number" },
    { label: "Share bought", formula: "([Gifts bought] / COUNTA(Gifts[Person])) * 100", type: "percent" },
  ],
};

describe("sheet design", () => {
  it("keeps a good design and translates its formulas to real Excel", () => {
    const { spec, dropped } = tidySheetSpec(christmas, "x");
    expect(dropped).toEqual([]);
    const tab = spec.tabs[0];
    expect(columnFormula(tab.columns[4].formula!, tab, 7, spec)).toBe("C7 - D7");
    // Example value in a calculated column is cleared; checkbox and choice values are tidied.
    expect(tab.exampleRows[0]).toEqual(["Mum", "Cosy socks", 25, 18, null, "Yes", "Online"]);
    const last = TAB_FIRST_ROW + 1 + 30 - 1;
    expect(summaryFormula(spec.summary[0].formula, spec, 0)).toBe(`SUM('Gifts'!$D$4:$D$${last})`);
    expect(summaryFormula(spec.summary[1].formula, spec, 1)).toBe("'Dashboard'!$C$4 - 'Dashboard'!$C$6");
    expect(summaryFormula(spec.summary[2].formula, spec, 2)).toBe(`(COUNTIF('Gifts'!$F$4:$F$${last},"Yes"))`);
    expect(summaryFormula(spec.summary[3].formula, spec, 3)).toBe(`('Dashboard'!$C$8 / COUNTA('Gifts'!$A$4:$A$${last})) * 100`);
    expect(summaryCells(spec).items.get("total spent")).toBe("'Dashboard'!$C$6");
  });

  it("drops anything outside the safe formula language", () => {
    const { spec, dropped } = tidySheetSpec(
      {
        ...christmas,
        tabs: [
          {
            ...christmas.tabs[0],
            columns: [
              { header: "Budget", type: "money" },
              { header: "Spent", type: "money", formula: "HYPERLINK(\"http://x\")" },
              { header: "Left", type: "money", formula: "{Budget} - {Nope}" },
              { header: "Twice", type: "money", formula: "{Budget} - A1" },
            ],
          },
        ],
        summary: [
          { label: "Evil", formula: 'WEBSERVICE("http://x")', type: "money" },
          { label: "Forward ref", formula: "[Later] + 1", type: "money" },
          { label: "Later", formula: "SUM(Gifts[Budget])", type: "money" },
          { label: "Unknown tab", formula: "SUM(Nope[Budget])", type: "money" },
        ],
      },
      "x",
    );
    expect(spec.tabs[0].columns.map((c) => c.formula)).toEqual([undefined, undefined, undefined, undefined]);
    expect(spec.summary.map((s) => s.label)).toEqual(["Later"]);
    expect(dropped.length).toBe(6);
  });

  it("always gives something buildable, with safe tab names", () => {
    const { spec } = tidySheetSpec({ tabs: [{ name: "Dashboard", columns: [{ header: "A", type: "text" }], exampleRows: [] }, { name: "Bad/Name?*", columns: [] }] }, "Fallback");
    expect(spec.title).toBe("Fallback");
    expect(spec.tabs.map((t) => t.name)).toEqual(["Dashboard 2"]);
    expect(tidySheetSpec({}, "T").spec.tabs[0].name).toBe("Tracker");
    expect(colLetter(0) + colLetter(25) + colLetter(26)).toBe("AZAA");
  });
});

describe("product format", () => {
  it("guesses from the idea and respects a chosen format", () => {
    expect(guessFormat("Monthly salary budget sheet")).toBe("excel");
    expect(guessFormat("Christmas list tracker")).toBe("pdf");
    expect(guessFormat("Cottagecore mushroom wall art")).toBe("art");
    expect(formatOf({ data: { format: "excel", suggestion: { idea: "mushroom art" } } })).toBe("excel");
    expect(formatOf({ demo: true, data: { format: "excel" } })).toBe("art");
  });
});

describe("preview maths", () => {
  it("works out example rows and the dashboard like the spreadsheet will", async () => {
    const { previewValues, evalArith, formatValue } = await import("../../src/shared/sheetSpec");
    expect(evalArith("(2 + 3) * 4 - 10 / 4")).toBe(17.5);
    expect(evalArith("5 / 0")).toBe(0);
    expect(evalArith("-3 + 1")).toBe(-2);
    const { spec } = tidySheetSpec(
      {
        ...christmas,
        tabs: [{ ...christmas.tabs[0], exampleRows: [["Mum", "Socks", 25, 18, null, "Yes", "Online"], ["Dad", "Gloves", 20, 30, null, "No", "Online"]] }],
      },
      "x",
    );
    const p = previewValues(spec);
    expect(p.tabs[0].rows.map((r) => r[4])).toEqual([7, -10]);
    expect(p.summary.map((s) => s.value)).toEqual([48, 352, 1, 50]);
    expect(formatValue(-10, "money", "£")).toBe("-£10.00");
  });
});

describe("artwork safety filter", () => {
  it("keeps drawings and strips anything that could run or fetch", async () => {
    const { sanitizeSvg, SvgError } = await import("../../src/shared/svg");
    const out = sanitizeSvg(
      `Here you go:\n<svg width="10" viewBox="0 0 1000 1250" onload="evil()"><script>bad()</script><a href="https://x.test"><rect width="10" height="10" fill="url(https://x.test/a.png)"/></a><image href="https://x.test/p.png"/><use href="#leaf"/><foreignObject><div>hi</div></foreignObject><circle r="4" style="fill:red" onmouseover="x()"/></svg> thanks`,
    );
    expect(out).not.toMatch(/script|onload|onmouseover|x\.test|foreignObject|<image/);
    expect(out).toMatch(/<use href="#leaf"\/>/);
    expect(out).toMatch(/xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    expect(out).toMatch(/width="2400" height="3000"/);
    expect(() => sanitizeSvg("no svg here")).toThrow(SvgError);
    expect(() => sanitizeSvg('<svg viewBox="0 0 10 10"></svg>')).toThrow(/doesn't draw/);
  });
});

describe("listing photo words", () => {
  it("fills in badges and features from the design, and talks pages (not tabs) for a printable", async () => {
    const { MONTHLY_BUDGET } = await import("../fixtures/monthlyBudget");
    const { marketingFor, pageCount, tabCount } = await import("../../src/shared/sheetSpec");
    const { spec } = tidySheetSpec(MONTHLY_BUDGET, "x");
    const excel = marketingFor(spec, "excel");
    expect(excel.badges[0]).toBe(`${tabCount(spec)} TABS`);
    expect(excel.badges).toContain("AUTO DASHBOARD");
    expect(excel.tagline).toBe(spec.subtitle.replace(/\s*·\s*/g, " | "));
    const pdf = marketingFor(spec, "pdf");
    expect(pdf.badges[0]).toBe(`${pageCount(spec)} PAGES`);
    expect(pdf.badges.join(" ")).not.toMatch(/TAB|DASHBOARD|CHART/);
    expect(pageCount(spec)).toBe(14);
    const own = marketingFor({ ...spec, marketing: { tagline: "Mine", badges: ["A"], features: ["B"] } }, "pdf");
    expect(own).toEqual({ tagline: "Mine", badges: ["A"], features: ["B"] });
  });
});

describe("full-size designs", () => {
  it("builds 12 month tabs, Settings lists, breakdowns, trends and goals that all check out", async () => {
    const { MONTHLY_BUDGET } = await import("../fixtures/monthlyBudget");
    const { dataSheets, dashboardLayout, listPlace, previewValues, summaryFormula } = await import("../../src/shared/sheetSpec");
    const { spec, dropped } = tidySheetSpec(MONTHLY_BUDGET, "x");
    expect(dropped).toEqual([]);
    expect(dataSheets(spec).map((s) => s.name)).toEqual(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Debts"]);
    expect(spec.tabs[0].columns[2]).toMatchObject({ type: "choice", optionsFrom: "Categories" });
    expect(listPlace(spec, "Categories")!.range).toBe("'Settings'!$B$5:$B$17");
    // Totals cover all 12 months.
    const income = summaryFormula(spec.summary[0].formula, spec, 0)!;
    expect(income).toMatch(/^SUM\('Jan'!\$E\$4:\$E\$51,'Feb'!/);
    expect(income.match(/'[A-Z][a-z]{2}'!/g)).toHaveLength(12);
    expect(summaryFormula(spec.summary[3].formula, spec, 3)).toMatch(/^\(SUMIF\('Jan'!\$C\$4:\$C\$51,"Savings",'Jan'!\$F\$4:\$F\$51\)\+SUMIF\('Feb'/);
    const layout = dashboardLayout(spec);
    expect(layout.goals[0].row).toBeGreaterThan(SUMMARY_ROWS_AFTER(layout));
    expect(layout.blocks.map((b) => [b.kind, b.rows, b.chart?.fromCol])).toEqual([
      ["breakdown", 13, 7],
      ["trend", 12, 8],
    ]);
    const p = previewValues(spec);
    expect(p.tabs[0].sheets).toHaveLength(12);
    expect(p.breakdowns[0].items.find((i) => i.label === "Rent")!.value).toBeGreaterThan(850 * 11);
    expect(p.trends[0].months[0]).toEqual({ month: "Jan", values: [2400, 1424.9] });
    expect(p.goals[0].value).toBeGreaterThan(90);
  });

  it("drops dashboard parts that point at nothing", () => {
    const { dropped, spec } = tidySheetSpec(
      { tabs: [{ name: "Log", columns: [{ header: "Amount", type: "money" }], exampleRows: [] }], breakdowns: [{ title: "x", list: "Nope", tab: "Log", by: "Amount", sum: "Amount" }], trends: [{ title: "y", tab: "Log", series: ["Amount"] }], goals: [{ label: "z", current: "a", target: "b" }] },
      "t",
    );
    expect(spec.breakdowns.length + spec.trends.length + spec.goals.length).toBe(0);
    expect(dropped).toHaveLength(3);
  });
});

const SUMMARY_ROWS_AFTER = (l: { items: Map<string, string> }) => Math.max(...[...l.items.values()].map((c) => Number(c.match(/\d+$/)![0])));
