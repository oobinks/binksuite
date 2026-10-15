// The product pipeline as a list of steps. Each step names its agent and room.
// Phase 1: every handler here is a demo handler (no AI calls, no cost).
// Phase 2+: swap a step's `run` for a real one — the engine doesn't change.
import { calculateFees, minimumPriceFor } from "../../../shared/fees";
import { checkListing, compliancePasses, type ComplianceCheck } from "../../../shared/compliance";
import { intBetween, pick } from "../../../shared/rng";
import { DEMO_NICHES, INSPECTOR_ISSUES, MOCKUP_SCENES, PRINT_SIZES, TRICKY_PHRASE } from "./demoContent";
import type { ProductRow, StepDef } from "./types";

export type { StepDef } from "./types";

function niche(p: ProductRow) {
  const name = (p.data as { niche?: string }).niche ?? p.niche;
  return DEMO_NICHES.find((n) => n.niche === name) ?? DEMO_NICHES[p.seed % DEMO_NICHES.length];
}

const score = (rng: () => number, lo = 4, hi = 10) => intBetween(rng, lo, hi);

export const STEPS: StepDef[] = [
  {
    kind: "niche_score",
    agent: "scout",
    room: "research",
    needsApproval: true,
    approvalKind: "review",
    durationMs: [12_000, 20_000],
    estimatedCostPence: 1,
    title: (p) => `Score niche: ${p.niche}`,
    run: ({ product, rng }) => {
      const n = niche(product);
      const scores = { demand: score(rng, 5), competition: score(rng, 3, 9), aiFit: score(rng, 6), pricePotential: score(rng, 4) };
      const overall = Math.round(((scores.demand + (11 - scores.competition) + scores.aiFit + scores.pricePotential) / 4) * 10) / 10;
      return {
        output: {
          niche: n.niche,
          scores,
          overall,
          keywords: n.keywords,
          summary: `${n.audience}. Demand looks ${scores.demand >= 7 ? "strong" : "steady"}, competition is ${scores.competition >= 7 ? "busy" : "manageable"}.`,
        },
        costPence: 1,
        log: `Scored “${n.niche}” — ${overall}/10`,
      };
    },
    next: "brief",
  },
  {
    kind: "brief",
    agent: "analyst",
    room: "research",
    needsApproval: false,
    approvalKind: "review",
    durationMs: [6_000, 10_000],
    estimatedCostPence: 1,
    title: (p) => `Write brief: ${p.niche}`,
    run: ({ product }) => {
      const n = niche(product);
      return {
        output: { productType: "Digital printable", audience: n.audience, palette: n.palette, sizes: PRINT_SIZES },
        productData: { palette: n.palette, audience: n.audience, keywords: n.keywords },
        productTitle: n.product,
        costPence: 1,
        log: `Brief ready for “${n.product}” → off to the Studio`,
      };
    },
    next: "images",
  },
  {
    kind: "images",
    agent: "designer",
    room: "studio",
    needsApproval: false,
    approvalKind: "spend",
    durationMs: [12_000, 18_000],
    estimatedCostPence: 3,
    title: (p) => `Generate art: ${p.title}`,
    run: ({ product, rng }) => {
      const images = Array.from({ length: 4 }, (_, i) => ({
        seed: product.seed * 10 + i,
        prompt: `${niche(product).niche}, soft printable illustration, palette ${niche(product).palette.slice(0, 3).join(" ")}, variation ${i + 1}`,
      }));
      return { output: { provider: "demo", images }, costPence: intBetween(rng, 2, 4), log: `Generated ${images.length} demo artworks` };
    },
    next: "inspect",
  },
  {
    kind: "inspect",
    agent: "inspector",
    room: "studio",
    needsApproval: true,
    approvalKind: "review",
    durationMs: [8_000, 12_000],
    estimatedCostPence: 1,
    title: (p) => `Inspect art: ${p.title}`,
    run: ({ product, rng }) => {
      const images = Array.from({ length: 4 }, (_, i) => {
        const flagged = rng() < 0.3;
        return { seed: product.seed * 10 + i, score: flagged ? intBetween(rng, 5, 7) : intBetween(rng, 8, 10), issues: flagged ? [pick(rng, INSPECTOR_ISSUES)] : [] };
      });
      const flagged = images.filter((i) => i.issues.length).length;
      return { output: { images }, costPence: 1, log: flagged ? `Flagged ${flagged} image(s) for a closer look` : "All images look clean" };
    },
    next: "print_files",
  },
  {
    kind: "print_files",
    agent: "printer",
    room: "studio",
    needsApproval: false,
    approvalKind: "review",
    durationMs: [6_000, 10_000],
    estimatedCostPence: 0,
    title: (p) => `Make print files: ${p.title}`,
    run: ({ product }) => {
      const slug = product.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const files = PRINT_SIZES.map((size) => ({ name: `${slug}-${size.replace(/\s+/g, "")}.pdf`, size, dpi: 300 }));
      return { output: { files, zip: `${slug}.zip` }, productData: { files: files.map((f) => f.name), zip: `${slug}.zip` }, log: `Packed ${files.length} sizes at 300 DPI → off to Mockups` };
    },
    next: "mockups",
  },
  {
    kind: "mockups",
    agent: "stylist",
    room: "mockups",
    needsApproval: true,
    approvalKind: "review",
    durationMs: [10_000, 14_000],
    estimatedCostPence: 0,
    title: (p) => `Style mockups: ${p.title}`,
    run: ({ product }) => {
      const mockups = MOCKUP_SCENES.map((scene, i) => ({ scene, seed: product.seed * 10 + (i % 4) }));
      return { output: { mockups }, productData: { mockups }, log: `Staged ${mockups.length} mockups` };
    },
    next: "copy",
  },
  {
    kind: "copy",
    agent: "copywriter",
    room: "listing",
    needsApproval: false,
    approvalKind: "review",
    durationMs: [8_000, 12_000],
    estimatedCostPence: 1,
    title: (p) => `Write listing: ${p.title}`,
    run: ({ product, task }) => {
      const n = niche(product);
      // Every 4th demo product slips in a blocked phrase so you can see the Warden catch it.
      const tricky = product.seed % 4 === 0 && !(task.input as { fix?: boolean }).fix;
      const title = `${n.product} | ${n.keywords.slice(0, 3).map(cap).join(" | ")} | Printable Digital Download`.slice(0, 140);
      const tags = [...n.keywords, "digital download", "instant download", "printable", "gift idea", "home decor", "wall art"].slice(0, 13).map((t) => t.slice(0, 20));
      const description = [
        `This design was created with AI assistance and carefully checked by hand. ${tricky ? TRICKY_PHRASE + "! " : ""}${n.product}: a cosy printable for ${n.audience.toLowerCase()}.`,
        `WHAT'S INCLUDED\n• High-resolution PDFs at 300 DPI\n• Sizes: ${PRINT_SIZES.join(", ")}`,
        "HOW IT WORKS\nThis is a digital download — no physical item will be shipped. Print at home, at a local print shop, or online.",
      ].join("\n\n");
      return {
        output: { title, tags, description, designedBy: "seller" },
        productData: { listing: { title, tags, description, designedBy: "seller" } },
        costPence: 1,
        log: `Wrote title, ${tags.length} tags and description`,
      };
    },
    next: "price",
  },
  {
    kind: "price",
    agent: "pricer",
    room: "listing",
    needsApproval: true,
    approvalKind: "review",
    durationMs: [5_000, 8_000],
    estimatedCostPence: 0,
    title: (p) => `Set price: ${p.title}`,
    run: ({ settings, rng }) => {
      const floor = minimumPriceFor(settings.minProfitPence, 10, settings.fees);
      // Round up to a friendly .49/.99 price above the floor.
      const pounds = Math.max(Math.ceil(floor / 100), intBetween(rng, 3, 7));
      const pricePence = pounds * 100 + (rng() < 0.5 ? 49 : 99) - 100;
      const finalPrice = pricePence < floor ? pricePence + 50 : pricePence;
      const fees = calculateFees({ pricePence: finalPrice, costPence: 10 }, settings.fees);
      return {
        output: { pricePence: finalPrice, floorPence: floor, netPence: fees.netPence, feesPence: fees.totalFeesPence, minProfitPence: settings.minProfitPence },
        pricePence: finalPrice,
        log: `Priced at £${(finalPrice / 100).toFixed(2)} (net £${(fees.netPence / 100).toFixed(2)})`,
      };
    },
    next: "compliance_check",
  },
  {
    kind: "compliance_check",
    agent: "warden",
    room: "compliance",
    needsApproval: true,
    approvalKind: "publish",
    durationMs: [6_000, 9_000],
    estimatedCostPence: 0,
    title: (p) => `Compliance check: ${p.title}`,
    run: ({ product, settings }) => {
      const listing = (product.data as { listing?: { title: string; tags: string[]; description: string; designedBy: "seller" } }).listing;
      const checks = checkListing(
        { title: listing?.title ?? product.title, tags: listing?.tags ?? [], description: listing?.description ?? "", designedBy: listing?.designedBy ?? "", imagesConfirmed: true, providerLicenceOk: settings.providerLicenceOk },
        settings.blocklist,
      );
      const pass = compliancePasses(checks);
      return { output: { checks, pass }, log: pass ? "All hard checks passed ✅" : `Blocked: ${checks.filter((c) => !c.pass && c.hard).map((c) => c.label).join("; ")}` };
    },
    next: "launch_pack",
    rejectTo: "copy",
    canApprove: (task, note) => {
      const out = task.output as { pass?: boolean; checks?: ComplianceCheck[] } | null;
      if (out?.pass) return null;
      return note && note.trim().length >= 5 ? null : "This listing fails a hard check. Send it back to the Listing Office, or override with a note (5+ characters).";
    },
  },
  {
    kind: "launch_pack",
    agent: null,
    room: "launch",
    needsApproval: true,
    approvalKind: "publish",
    durationMs: [0, 0],
    estimatedCostPence: 0,
    title: (p) => `Launch: ${p.title}`,
    run: ({ product }) => {
      const d = product.data as Record<string, unknown>;
      return {
        output: { listing: d.listing, pricePence: product.pricePence, files: d.files, zip: d.zip, mockups: d.mockups },
        log: "Copy-paste pack ready for Etsy",
      };
    },
    next: null,
  },
];

export const STEP_BY_KIND: Record<string, StepDef> = Object.fromEntries(STEPS.map((s) => [s.kind, s]));
export const FIRST_STEP = STEPS[0].kind;

function cap(s: string) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}
