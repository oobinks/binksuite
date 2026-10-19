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
