// Canned content for the demo simulator. Real agents (Phase 2+) replace this with Claude output.

export interface DemoNiche {
  niche: string;
  product: string;
  keywords: string[];
  palette: string[];
  audience: string;
}

export const DEMO_NICHES: DemoNiche[] = [
  {
    niche: "Cosy autumn wall art",
    product: "Autumn Cottage Print Set",
    keywords: ["autumn print", "cosy wall art", "fall decor", "cottage art", "pumpkin print", "printable art", "autumn poster"],
    palette: ["#c8643b", "#e9a96b", "#7a5c3e", "#f3dcc0", "#5b6b3a"],
    audience: "Home decorators refreshing for the season",
  },
  {
    niche: "Minimalist habit tracker",
    product: "Minimal Habit Tracker Pages",
    keywords: ["habit tracker", "printable planner", "minimal planner", "daily tracker", "goal tracker", "bullet journal", "a4 printable"],
    palette: ["#2f2f2f", "#d9d9d9", "#9fb7a3", "#f4f1ea", "#c9b18f"],
    audience: "Planner fans who like clean layouts",
  },
  {
    niche: "Botanical nursery prints",
    product: "Gentle Botanical Nursery Trio",
    keywords: ["nursery print", "botanical art", "baby room decor", "sage green art", "leaf print", "neutral nursery", "plant poster"],
    palette: ["#9cb59a", "#e8e1d0", "#6d8b74", "#f6efe4", "#c7a27c"],
    audience: "Parents-to-be decorating a calm nursery",
  },
  {
    niche: "Retro kitchen posters",
    product: "Retro Kitchen Poster Pack",
    keywords: ["kitchen print", "retro poster", "food art", "kitchen decor", "70s poster", "mid century art", "fruit print"],
    palette: ["#e4572e", "#f3a712", "#29335c", "#f0e6d2", "#669bbc"],
    audience: "Renters adding colour to small kitchens",
  },
  {
    niche: "Kids chore chart",
    product: "Friendly Animal Chore Chart",
    keywords: ["chore chart", "kids printable", "reward chart", "kids routine", "responsibility", "toddler chart", "family planner"],
    palette: ["#ffb4a2", "#b5e48c", "#99d98c", "#fff3b0", "#80c7e5"],
    audience: "Parents building routines with little ones",
  },
  {
    niche: "Moody cottagecore landscapes",
    product: "Moody Meadow Landscape Prints",
    keywords: ["moody art", "cottagecore", "landscape print", "vintage painting", "dark academia", "meadow art", "gallery wall"],
    palette: ["#3d4a3d", "#7d8b6a", "#c2b280", "#2b2d42", "#a3a380"],
    audience: "Fans of vintage-feel gallery walls",
  },
  {
    niche: "Budget planner pages",
    product: "Cosy Budget Planner Bundle",
    keywords: ["budget planner", "finance tracker", "savings tracker", "bill tracker", "monthly budget", "printable planner", "expense log"],
    palette: ["#a3c4bc", "#f2e9e4", "#4a4e69", "#c9ada7", "#9a8c98"],
    audience: "People taking control of their money",
  },
  {
    niche: "Watercolour bird prints",
    product: "Watercolour Garden Birds Set",
    keywords: ["bird print", "watercolour art", "robin print", "garden birds", "nature wall art", "bird lover gift", "british birds"],
    palette: ["#c44536", "#7ca5b8", "#e6d5b8", "#4f6d7a", "#dd9c4f"],
    audience: "Bird lovers and nature gift-buyers",
  },
  {
    niche: "Christmas gift tags",
    product: "Woodland Christmas Gift Tags",
    keywords: ["gift tags", "christmas printable", "xmas tags", "woodland christmas", "present labels", "holiday printable", "diy christmas"],
    palette: ["#9b2226", "#2d6a4f", "#e9d8a6", "#bb3e03", "#f8f4e3"],
    audience: "Crafty gift-wrappers in December",
  },
  {
    niche: "Positive affirmation cards",
    product: "Gentle Affirmation Card Deck",
    keywords: ["affirmation cards", "self care", "positive quotes", "mindfulness", "printable cards", "mental health", "daily affirmations"],
    palette: ["#f4acb7", "#ffcad4", "#9d8189", "#d8e2dc", "#ffe5d9"],
    audience: "Self-care lovers and gift-givers",
  },
];

/** A deliberately non-compliant listing so the Warden has something to catch in the demo. */
export const TRICKY_PHRASE = "Disney-style magic for little princesses";

export const PRINT_SIZES = ["A5", "A4", "A3", "US Letter", "8x10", "11x14"];
export const MOCKUP_SCENES = ["frame", "desk", "tablet", "gallery"] as const;
export const INSPECTOR_ISSUES = [
  "Text looks slightly garbled",
  "Edge is a little soft — upscale before printing",
  "One leaf has an odd shape",
  "Colour banding in the sky",
];
