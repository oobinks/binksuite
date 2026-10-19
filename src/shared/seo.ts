// 🔎 Listing SEO: the search phrases buyers use (read from the tags and titles of
// the listings Etsy shows first, via the official API), and a listing check that
// scores a title / tags / description the way the best template shops write them.
import { ETSY_LIMITS } from "./compliance";

export interface SearchPhrase {
  phrase: string;
  /** How many of the top listings use it (tag or title). */
  listings: number;
  /** Favourites on those listings: a rough "this sells" signal. */
  favs: number;
}

export interface KeywordResearch {
  /** The main search phrase (what the product should rank for). */
  keyword: string;
  /** etsy = read from live Etsy results; scout = Scout's keywords only. */
  source: "etsy" | "scout";
  /** Competing listings for the main phrase (Etsy's count). */
  competing?: number;
  phrases: SearchPhrase[];
  checkedAt: string;
}

const STOP = new Set(["a", "an", "and", "the", "for", "of", "to", "in", "on", "with", "your", "my", "or", "by", "is", "it", "this", "that", "be", "at"]);
/** Words that say "it's a download" but aren't what anyone searches for alone. */
const FILLER = new Set(["digital", "download", "instant", "printable", "template", "file", "files", "pdf", "editable", "etsy"]);

export function cleanPhrase(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/[^a-z0-9 '&-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 2–3 word runs from a title, split at | , - and the like (where sellers separate phrases). */
function titleGrams(title: string): string[] {
  const out = new Set<string>();
  for (const chunk of title.split(/[|,•·:;/()–—]| - /)) {
    const words = cleanPhrase(chunk).split(" ").filter(Boolean);
    for (let n = 2; n <= 3; n++)
      for (let i = 0; i + n <= words.length; i++) {
        const w = words.slice(i, i + n);
        if (STOP.has(w[0]) || STOP.has(w[n - 1]) || w.every((x) => FILLER.has(x) || STOP.has(x))) continue;
        out.add(w.join(" "));
      }
  }
  return [...out];
}

/**
 * The phrases the top listings for a search share, best first. Tags count fully; title
 * phrases count when at least 3 listings use them. Generic "digital download" style
 * phrases sink to the bottom.
 */
export function phrasesFromListings(listings: { title: string; tags: string[]; favourites: number }[], max = 30): SearchPhrase[] {
  const tally = new Map<string, SearchPhrase & { inTags: boolean }>();
  for (const l of listings) {
    const seen = new Set<string>();
    const add = (p: string, inTags: boolean) => {
      if (!p || p.length > ETSY_LIMITS.tagCharsMax || seen.has(p)) return;
      seen.add(p);
      const t = tally.get(p) ?? { phrase: p, listings: 0, favs: 0, inTags: false };
      t.listings++;
      t.favs += Math.max(0, l.favourites);
      t.inTags ||= inTags;
      tally.set(p, t);
    };
    for (const tag of l.tags) add(cleanPhrase(tag), true);
    for (const g of titleGrams(l.title)) add(g, false);
  }
  const generic = (p: string) => p.split(" ").every((w) => FILLER.has(w) || STOP.has(w));
  return [...tally.values()]
    .filter((t) => (t.inTags ? t.listings >= 2 : t.listings >= 3) && !generic(t.phrase))
    .map((t) => ({ ...t, rank: t.listings * 2 + Math.log10(1 + t.favs) + (t.phrase.includes(" ") ? 1 : 0) }))
    .sort((a, b) => b.rank - a.rank || b.favs - a.favs)
    .slice(0, max)
    .map(({ phrase, listings, favs }) => ({ phrase, listings, favs }));
}

/** Trim a title to Etsy's limit at a phrase (or word) boundary, never mid-word. */
export function fitTitle(title: string, max: number = ETSY_LIMITS.titleMax): string {
  const t = title.replace(/\s+/g, " ").replace(/\s*\|\s*/g, " | ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1);
  const at = cut.lastIndexOf(" | ") > max * 0.6 ? cut.lastIndexOf(" | ") : cut.lastIndexOf(" ");
  return t.slice(0, at > 0 ? at : max).replace(/[\s|,&-]+$/, "").trim();
}

export interface SeoCheck {
  key: string;
  label: string;
  pass: boolean;
  tip: string;
}

/** How Etsy-ready the words are. Advice only: nothing here blocks a listing. */
export function seoCheck(l: { title: string; tags: string[]; description: string }, research?: KeywordResearch | null): { score: number; checks: SeoCheck[] } {
  const title = l.title.trim();
  const main = cleanPhrase(research?.keyword ?? l.tags[0] ?? "");
  const lowerTitle = cleanPhrase(title);
  const words = lowerTitle.split(" ").filter((w) => w.length > 2 && !STOP.has(w));
  const counts = new Map<string, number>();
  for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
  const repeated = [...counts].filter(([, n]) => n > 2).map(([w]) => w);
  const shouty = title.split(/\s+/).filter((w) => /^[A-Z]{5,}$/.test(w.replace(/[^A-Za-z]/g, "")));
  const top = (research?.phrases ?? []).slice(0, 12).map((p) => p.phrase);
  const tagSet = new Set(l.tags.map(cleanPhrase));
  const covered = top.filter((p) => tagSet.has(p) || lowerTitle.includes(p));
  const multiWord = l.tags.filter((t) => t.trim().includes(" ")).length;
  const desc = l.description;
  const opening = cleanPhrase(desc.slice(0, 200));
  const mainWords = main.split(" ").filter((w) => !STOP.has(w));

  const checks: SeoCheck[] = [
    {
      key: "front",
      label: "Main search phrase at the start of the title",
      pass: !!main && cleanPhrase(title.slice(0, 50)).includes(main),
      tip: `Shoppers and Etsy read the first few words most. Start with “${main || "what it is"}”.`,
    },
    {
      key: "length",
      label: "Title uses the space well (80–140 characters)",
      pass: title.length >= 80 && title.length <= ETSY_LIMITS.titleMax,
      tip: "Add 2–3 more phrases people search for, separated by | (e.g. who it's for, what it does).",
    },
    {
      key: "repeat",
      label: "No word repeated more than twice in the title",
      pass: repeated.length === 0,
      tip: `Repeating words doesn't help you rank and reads as spammy${repeated.length ? `: ${repeated.join(", ")}` : ""}.`,
    },
    {
      key: "caps",
      label: "No shouty CAPITALS in the title",
      pass: shouty.length === 0,
      tip: "Write the title in normal case so it reads well in search results.",
    },
    {
      key: "tags",
      label: "All 13 tags used",
      pass: l.tags.length === ETSY_LIMITS.tagsMax,
      tip: "Every empty tag is a search you can't be found for.",
    },
    {
      key: "longtail",
      label: "Tags are mostly 2–3 word phrases",
      pass: multiWord >= 10,
      tip: "Phrases like “bill tracker excel” match what buyers type and face less competition than single words.",
    },
    {
      key: "fit",
      label: "Every tag fits Etsy's 20 characters",
      pass: l.tags.every((t) => t.length <= ETSY_LIMITS.tagCharsMax),
      tip: "Etsy cuts longer tags off. Shorten them.",
    },
  ];
  if (top.length)
    checks.push({
      key: "searches",
      label: `Covers what buyers search (${covered.length} of the top ${top.length} phrases)`,
      pass: covered.length >= Math.min(5, top.length),
      tip: `Popular phrases you're not using yet: ${top.filter((p) => !covered.includes(p)).slice(0, 4).join(", ")}.`,
    });
  checks.push(
    {
      key: "opening",
      label: "Description opens with what it is",
      pass: mainWords.length > 0 && mainWords.every((w) => opening.includes(w)),
      tip: "The first lines show in Google results and Etsy previews. Mention the main phrase there.",
    },
    {
      key: "sections",
      label: "Description has clear sections (features, what's included, how it works)",
      pass: /what'?s included/i.test(desc) && /how it works/i.test(desc),
      tip: "Buyers skim. Headed sections answer their questions before they ask.",
    },
  );
  const score = Math.round((checks.filter((c) => c.pass).length / checks.length) * 100);
  return { score, checks };
}
