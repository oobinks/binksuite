// Listing compliance rules. Used by the Warden agent and (Phase 3) the Listing Office.
// Limits were checked against Etsy's docs in October 2026; re-check in Phase 3.

export const ETSY_LIMITS = {
  titleMax: 140,
  tagsMax: 13,
  tagCharsMax: 20,
} as const;

export const DEFAULT_BLOCKLIST = [
  "disney",
  "marvel",
  "pokemon",
  "harry potter",
  "hogwarts",
  "taylor swift",
  "barbie",
  "star wars",
  "nike",
  "hello kitty",
  "bluey",
  "peppa pig",
];

// Etsy's AI rules (22 October 2026): AI-written "functional guides" (patterns, recipes,
// instructions) aren't allowed. BinkSuite makes everything with AI, so it never makes them.
// Planners, trackers and templates are fine: the buyer fills those in themselves.
const FUNCTIONAL_GUIDE =
  /\b(recipes?|recipe (book|cards?)|cookbooks?|(knitting|crochet|sewing|quilt(ing)?|cross[- ]stitch|embroidery|amigurumi|origami|macrame|needlepoint|beading|pdf) patterns?|patterns? (for|to) (knit|crochet|sew|make)|tutorials?|how[- ]to guides?|step[- ]by[- ]step guides?|instructions?|instruction (book|manual)|diy guides?|(workout|training|exercise|fitness) (plans?|programmes?|programs?))\b/i;

/** The functional-guide words in a product idea or listing (empty if none). */
export function functionalGuideIn(text: string): string | null {
  return FUNCTIONAL_GUIDE.exec(text)?.[0] ?? null;
}

export const FUNCTIONAL_GUIDE_RULE =
  "Never suggest or make functional guides (recipes, cookbooks, knitting/crochet/sewing patterns, tutorials, how-to guides, instructions or workout plans): Etsy doesn't allow AI-written ones. Planners, trackers, templates and art are fine.";

/** Etsy asks sellers to say how listing photos were made; this line goes in every description. */
export const PHOTO_NOTE: Record<"art" | "excel" | "pdf", string> = {
  art: "The room photos are digital mockups: the rooms were created with AI to show how the print could look. The artwork shown is the artwork you'll receive.",
  excel: "The photos are previews made from the actual files you'll receive, shown on mockup devices.",
  pdf: "The photos are previews made from the actual pages you'll receive, shown as mockups.",
};

/** True when the description already says how the photos were made. */
export function hasPhotoNote(description: string): boolean {
  return /\b(mockups?|previews? (made )?from the actual)\b/i.test(description) && /\bphotos?\b/i.test(description);
}

export interface ListingDraft {
  title: string;
  tags: string[];
  description: string;
  /** Etsy "Designed by" — must be the seller for AI-assisted designs. */
  designedBy?: "seller" | "another_company" | "";
  imagesConfirmed?: boolean;
  providerLicenceOk?: boolean;
}

export interface ComplianceCheck {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
  /** Hard checks block launch; soft ones are warnings. */
  hard: boolean;
}

const AI_DISCLOSURE = /\b(ai|artificial intelligence)[- ](generated|assisted|created|made)|\b(made|created|designed|generated|produced) (with|using|by)( the help of)? (ai|artificial intelligence)\b/i;

export function firstParagraph(text: string): string {
  return text.trim().split(/\n\s*\n/)[0] ?? "";
}

export function hasAiDisclosure(description: string): boolean {
  return AI_DISCLOSURE.test(firstParagraph(description));
}

export function blockedTermsIn(text: string, blocklist: string[] = DEFAULT_BLOCKLIST): string[] {
  const lower = text.toLowerCase();
  return blocklist.filter((term) => {
    const t = term.trim().toLowerCase();
    if (!t) return false;
    const re = new RegExp(`(^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`, "i");
    return re.test(lower);
  });
}

export function checkListing(d: ListingDraft, blocklist: string[] = DEFAULT_BLOCKLIST): ComplianceCheck[] {
  const tooLongTags = d.tags.filter((t) => t.length > ETSY_LIMITS.tagCharsMax);
  const blocked = blockedTermsIn([d.title, d.tags.join(" "), d.description].join("\n"), blocklist);
  const guide = functionalGuideIn([d.title, d.tags.join(" ")].join("\n"));
  return [
    {
      id: "title-length",
      label: `Title ≤ ${ETSY_LIMITS.titleMax} characters`,
      pass: d.title.trim().length > 0 && d.title.length <= ETSY_LIMITS.titleMax,
      detail: `${d.title.length} characters`,
      hard: true,
    },
    {
      id: "tag-count",
      label: `Up to ${ETSY_LIMITS.tagsMax} tags`,
      pass: d.tags.length > 0 && d.tags.length <= ETSY_LIMITS.tagsMax,
      detail: `${d.tags.length} tags`,
      hard: true,
    },
    {
      id: "tag-length",
      label: `Each tag ≤ ${ETSY_LIMITS.tagCharsMax} characters`,
      pass: tooLongTags.length === 0,
      detail: tooLongTags.length ? `Too long: ${tooLongTags.join(", ")}` : "All tags fit",
      hard: true,
    },
    {
      id: "ai-disclosure",
      label: "AI disclosure in the first paragraph",
      pass: hasAiDisclosure(d.description),
      detail: hasAiDisclosure(d.description) ? "Disclosure found" : "Add e.g. “This design was created with AI assistance.”",
      hard: true,
    },
    {
      id: "designed-by",
      label: "“Designed by” set to you (the seller)",
      pass: d.designedBy === "seller",
      detail: d.designedBy ? `Set to ${d.designedBy}` : "Not set",
      hard: true,
    },
    {
      id: "blocklist",
      label: "No brands, characters or celebrities",
      pass: blocked.length === 0,
      detail: blocked.length ? `Found: ${blocked.join(", ")}` : "Clean",
      hard: true,
    },
    {
      id: "functional-guide",
      label: "Not a recipe, pattern or instructions",
      pass: !guide,
      detail: guide ? `Etsy doesn't allow AI-written functional guides. Found: “${guide}”` : "Clean",
      hard: true,
    },
    {
      id: "photo-note",
      label: "Says how the listing photos were made",
      pass: hasPhotoNote(d.description),
      detail: hasPhotoNote(d.description) ? "Photo note found" : "Etsy asks you to say when photos are mockups or AI-edited. Refresh the copy to add it.",
      hard: false,
    },
    {
      id: "images-confirmed",
      label: "You've looked at every image",
      pass: !!d.imagesConfirmed,
      detail: d.imagesConfirmed ? "Confirmed" : "Tick once you've checked them",
      hard: false,
    },
    {
      id: "provider-licence",
      label: "Image provider licence allows selling",
      pass: !!d.providerLicenceOk,
      detail: d.providerLicenceOk ? "Licence OK" : "Confirm in Settings",
      hard: false,
    },
  ];
}

export function compliancePasses(checks: ComplianceCheck[]): boolean {
  return checks.every((c) => c.pass || !c.hard);
}
