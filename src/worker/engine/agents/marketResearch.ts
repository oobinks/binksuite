// Market research for ideas YOU suggest in the Research Lab.
// Phase 1: a simulated report, stable for a given idea, built from simple rules
// (trademark check, seasonality, how text-heavy the design is).
// Phase 2: Scout replaces this with Claude + web search; the report shape stays the same.
import { blockedTermsIn } from "../../../shared/compliance";
import { hashString, intBetween, mulberry32, pick } from "../../../shared/rng";
import type { DemoNiche } from "./demoContent";

export type Verdict = "go" | "maybe" | "skip";

export interface MarketReport {
  idea: string;
  verdict: Verdict;
  overall: number;
  scores: { demand: number; competition: number; aiFit: number; pricePotential: number };
  summary: string;
  reasons: string[];
  risks: string[];
  angles: string[];
  keywords: string[];
  priceRangePence: [number, number];
  seasonality: string;
  sources: string;
}

const STOP = new Set(["a", "an", "the", "and", "or", "for", "of", "with", "to", "in", "on", "my", "set", "printable", "printables"]);
const SEASONS: [RegExp, string][] = [
  [/christmas|xmas|festive|santa|advent/, "Peaks Oct–Dec. List by early October."],
  [/halloween|spooky|pumpkin/, "Peaks Sep–Oct. List by late August."],
  [/autumn|fall\b|harvest/, "Peaks Aug–Oct."],
  [/valentine|love heart/, "Peaks Jan–Feb."],
  [/easter|bunny/, "Peaks Feb–Apr."],
  [/wedding|bridal/, "Steady, with a spring–summer peak."],
  [/back to school|teacher|classroom/, "Peaks Jul–Sep."],
  [/summer|beach/, "Peaks May–Jul."],
  [/new year|planner|calendar|habit|budget/, "Big spike Dec–Jan, then steady."],
];
const TEXT_HEAVY = /planner|tracker|checklist|calendar|quote|affirmation|labels?|worksheet|chart|invitation|sign/;

const cap = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
const clamp = (n: number) => Math.max(1, Math.min(10, n));

export function researchIdea(ideaRaw: string, notes = "", blocklist?: string[]): MarketReport {
  const idea = ideaRaw.trim().replace(/\s+/g, " ");
  const lower = idea.toLowerCase();
  const rng = mulberry32(hashString(lower));
  const words = (lower.match(/[a-z]+/g) ?? []).filter((w) => !STOP.has(w) && w.length > 2);
  const blocked = blockedTermsIn(`${idea} ${notes}`, blocklist);
  const season = SEASONS.find(([re]) => re.test(lower))?.[1];
  const textHeavy = TEXT_HEAVY.test(lower);

  const scores = {
    demand: clamp(intBetween(rng, 4, 9) + (season ? 1 : 0)),
    competition: clamp(intBetween(rng, 3, 9) + (words.length <= 1 ? 1 : 0) - (words.length >= 3 ? 1 : 0)),
    aiFit: clamp(intBetween(rng, 6, 10) - (textHeavy ? 2 : 0)),
    pricePotential: clamp(intBetween(rng, 4, 9) + (/bundle|set|pack|wedding/.test(lower) ? 1 : 0)),
  };
  const overall = Math.round(((scores.demand + (11 - scores.competition) + scores.aiFit + scores.pricePotential) / 4) * 10) / 10;
  let verdict: Verdict = overall >= 7 ? "go" : overall >= 5.5 ? "maybe" : "skip";
  if (blocked.length) verdict = "skip";

  const reasons = [
    scores.demand >= 7 ? `Plenty of people search for “${lower}”-style designs.` : `Searches for “${lower}” look modest. It's worth testing, but it won't be a big seller alone.`,
    scores.competition >= 7
      ? "Lots of similar listings already. You'd need a clear twist to stand out."
      : "Not too crowded. There's room for a fresh take.",
    scores.aiFit >= 7 ? "AI art suits this well, so making it should be quick and cheap." : "This leans on precise text or layout, which AI art finds harder. Expect more hand-checking.",
  ];
  const risks: string[] = [];
  if (blocked.length) risks.push(`Uses a protected name (${blocked.join(", ")}). Etsy can remove listings like this. Pick an unbranded version instead.`);
  if (textHeavy) risks.push("Text-heavy designs need careful spelling checks in the Studio.");
  if (scores.competition >= 8) risks.push("Very busy niche: price and photos will matter a lot.");
  if (season) risks.push(`Seasonal: ${season}`);

  const main = words.slice(0, 3).join(" ") || lower;
  const angles = [
    `${cap(main)} bundle in 3 sizes (A4, A3, US Letter)`,
    pick(rng, [`Minimal neutral ${main}`, `Bright retro ${main}`, `Watercolour ${main}`, `Vintage-style ${main}`]),
    pick(rng, [`${cap(main)} for kids' rooms`, `Personalised ${main} with a name`, `${cap(main)} gift version`, `Matching set of 3 ${main} prints`]),
  ];
  const keywords = [...new Set([lower, `${main} printable`, `${main} print`, `${main} wall art`, `${main} gift`, `digital ${main}`, ...words.map((w) => `${w} decor`)])]
    .map((k) => k.slice(0, 20).trim())
    .filter(Boolean)
    .slice(0, 8);
  const lo = intBetween(rng, 2, 4) * 100 - 1;
  const hi = lo + intBetween(rng, 2, 6) * 100;

  const verdictLine =
    verdict === "go" ? "Looks worth making." : verdict === "maybe" ? "Could work with the right angle." : blocked.length ? "Skip this as written: trademark risk." : "Probably not worth it right now.";
  return {
    idea,
    verdict,
    overall,
    scores,
    summary: `${verdictLine} ${notes ? "I've taken your notes into account. " : ""}Similar listings sell for about £${(lo / 100).toFixed(2)}–£${(hi / 100).toFixed(2)}.`,
    reasons,
    risks,
    angles,
    keywords,
    priceRangePence: [lo, hi],
    seasonality: season ?? "Sells year-round.",
    sources: "Simulated in demo mode. With your Anthropic key (Phase 2), Scout researches the web for real.",
  };
}

/** Turn an approved suggestion into the niche info the rest of the pipeline uses. */
export function nicheFromSuggestion(idea: string, report: MarketReport | undefined, seed: number): DemoNiche {
  const rng = mulberry32(seed);
  const palettes = [
    ["#c8643b", "#e9a96b", "#7a5c3e", "#f3dcc0", "#5b6b3a"],
    ["#9cb59a", "#e8e1d0", "#6d8b74", "#f6efe4", "#c7a27c"],
    ["#e4572e", "#f3a712", "#29335c", "#f0e6d2", "#669bbc"],
    ["#f4acb7", "#ffcad4", "#9d8189", "#d8e2dc", "#ffe5d9"],
  ];
  return {
    niche: idea,
    product: `${cap(idea)} Printable`.slice(0, 60),
    keywords: report?.keywords ?? [idea.toLowerCase()],
    palette: pick(rng, palettes),
    audience: `People looking for ${idea.toLowerCase()}`,
  };
}
