// A full-size design, like a best-selling Etsy budget template: 12 month tabs,
// editable categories, a dashboard with breakdown + trend charts and goals.
export const MONTHLY_BUDGET = {
  title: "The Ultimate Budget",
  subtitle: "Monthly budget · bill tracker · debt payoff · savings goals",
  currency: "£",
  accent: "#5b7f6e",
  howTo: [
    "Start on the Settings tab: rename the categories to suit you.",
    "Type your monthly take-home pay and savings target on the Dashboard.",
    "Each month, add your income and spending on that month's tab.",
    "Tick bills off as you pay them.",
    "The Dashboard and charts update by themselves.",
  ],
  inputs: [
    { label: "Monthly take-home pay", type: "money", example: 2400 },
    { label: "Savings target this year", type: "money", example: 3000 },
  ],
  lists: [
    { name: "Categories", items: ["Rent", "Groceries", "Bills", "Transport", "Eating out", "Fun", "Savings"] },
    { name: "Pay by", items: ["Card", "Direct debit", "Cash"] },
  ],
  tabs: [
    {
      name: "Monthly",
      repeat: "months",
      columns: [
        { header: "Date", type: "date" },
        { header: "What", type: "text" },
        { header: "Category", type: "choice", optionsFrom: "Categories" },
        { header: "Paid by", type: "choice", optionsFrom: "Pay by" },
        { header: "Income", type: "money" },
        { header: "Amount", type: "money" },
        { header: "Paid?", type: "checkbox" },
      ],
      exampleRows: [
        ["", "Salary", "", "", "2400", "", "Yes"],
        ["", "Rent", "Rent", "Direct debit", "", "850", "Yes"],
        ["", "Big shop", "Groceries", "Card", "", "96.40", "Yes"],
        ["", "Phone & broadband", "Bills", "Direct debit", "", "58", "Yes"],
        ["", "Train pass", "Transport", "Card", "", "120", "No"],
        ["", "Pizza night", "Eating out", "Card", "", "32.5", "Yes"],
        ["", "Cinema", "Fun", "Card", "", "18", "Yes"],
        ["", "To savings", "Savings", "Direct debit", "", "250", "Yes"],
      ],
      blankRows: 40,
    },
    {
      name: "Debts",
      columns: [
        { header: "Debt", type: "text" },
        { header: "Balance", type: "money" },
        { header: "Monthly payment", type: "money" },
        { header: "Months to clear", type: "number", formula: "{Balance} / {Monthly payment}" },
      ],
      exampleRows: [
        ["Credit card", "1200", "150", ""],
        ["Car loan", "4800", "220", ""],
      ],
      blankRows: 12,
    },
  ],
  summary: [
    { label: "Income this year", formula: "SUM(Monthly[Income])", type: "money" },
    { label: "Spent this year", formula: "SUM(Monthly[Amount])", type: "money" },
    { label: "Left over", formula: "[Income this year] - [Spent this year]", type: "money" },
    { label: "Saved so far", formula: 'SUMIF(Monthly[Category], "Savings", Monthly[Amount])', type: "money" },
    { label: "Bills still to pay", formula: 'COUNTIF(Monthly[Paid?], "No")', type: "number" },
    { label: "Total debt", formula: "SUM(Debts[Balance])", type: "money" },
  ],
  breakdowns: [{ title: "Spending by category", list: "Categories", tab: "Monthly", by: "Category", sum: "Amount", chart: "doughnut" }],
  trends: [{ title: "Income vs spending", tab: "Monthly", series: ["Income", "Amount"], chart: "bar" }],
  goals: [{ label: "Savings goal", current: "Saved so far", target: "Savings target this year" }],
};
