import { z } from "zod";
import { AGENTS, type AgentId } from "./registry";
import { DEFAULT_FEES } from "./fees";
import { DEFAULT_BLOCKLIST } from "./compliance";

export const feeSettingsSchema = z.object({
  listingFeeUsd: z.number().min(0).max(10),
  usdToGbp: z.number().min(0.1).max(5),
  transactionRate: z.number().min(0).max(1),
  processingRate: z.number().min(0).max(1),
  processingFixedPence: z.number().int().min(0).max(1000),
  regulatoryRate: z.number().min(0).max(1),
  vatRate: z.number().min(0).max(1),
  vatOnProcessing: z.boolean(),
  offsiteAdsRate: z.number().min(0).max(1),
  offsiteAdsCapUsd: z.number().min(0).max(10000),
  currencyConversionRate: z.number().min(0).max(1),
});

export const settingsSchema = z.object({
  demoMode: z.boolean(),
  theme: z.enum(["light", "dark", "system"]),
  fees: feeSettingsSchema,
  /** Minimum net profit per sale the Pricer aims for. */
  minProfitPence: z.number().int().min(0).max(100_000),
  /** Monthly net profit goal shown on the HQ. */
  monthlyTargetPence: z.number().int().min(0).max(10_000_000),
  /** Spend guardrails for AI/image APIs. */
  dailyCapPence: z.number().int().min(0).max(1_000_000),
  monthlyCapPence: z.number().int().min(0).max(10_000_000),
  toneOfVoice: z.string().max(1000),
  shopName: z.string().max(80),
  agentsEnabled: z.record(z.string(), z.boolean()),
  blocklist: z.array(z.string().max(60)).max(500),
  providerLicenceOk: z.boolean(),
  /** Real AI via Cloudflare Workers AI (free daily allowance). */
  ai: z.object({
    enabled: z.boolean(),
    /** Who does the thinking: free Cloudflare Workers AI, or Claude Code on your Claude subscription. */
    provider: z.enum(["workers", "claude-code"]),
    /** Claude Code: start a session automatically while you have the site open and Claude has work. */
    claudeAutoStart: z.boolean(),
    textModel: z.string().min(3).max(100),
    imageModel: z.string().min(3).max(100),
    /** Stop for the day at this many estimated "neurons" (free allowance is 10,000/day). */
    dailyNeuronCap: z.number().int().min(0).max(1_000_000),
  }),
  /** Which kinds of product to research, suggest and make (at least one stays on). */
  formats: z
    .object({ art: z.boolean(), excel: z.boolean(), pdf: z.boolean() })
    .refine((f) => f.art || f.excel || f.pdf, "Keep at least one kind of product switched on."),
  /** Trend Radar, Daily ideas, undercut pricing and Price Watch. */
  radar: z.object({
    /** Automatically research the day's best ideas every morning. */
    autoDaily: z.boolean(),
    dailyIdeas: z.number().int().min(1).max(10),
    /** Price this % below the market median (never below your minimum profit). */
    undercutPercent: z.number().min(0).max(60),
    /** Price Watch flags listings priced more than this % above the market. */
    priceTolerancePercent: z.number().min(0).max(100),
    /** Your Etsy shop name, so Price Watch can check your live listings. */
    etsyShopName: z.string().max(60),
  }),
});

export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  demoMode: true,
  theme: "system",
  fees: DEFAULT_FEES,
  minProfitPence: 150,
  monthlyTargetPence: 20000,
  dailyCapPence: 200,
  monthlyCapPence: 2000,
  toneOfVoice: "Warm, cosy and friendly — like a note from a favourite little shop. British spelling.",
  shopName: "My Printables Shop",
  agentsEnabled: Object.fromEntries(AGENTS.map((a) => [a.id, true])) as Record<AgentId, boolean>,
  blocklist: DEFAULT_BLOCKLIST,
  providerLicenceOk: false,
  ai: {
    enabled: true,
    provider: "workers",
    claudeAutoStart: true,
    textModel: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    imageModel: "@cf/black-forest-labs/flux-1-schnell",
    dailyNeuronCap: 9000,
  },
  formats: { art: true, excel: true, pdf: true },
  radar: {
    autoDaily: true,
    dailyIdeas: 5,
    undercutPercent: 10,
    priceTolerancePercent: 10,
    etsyShopName: "",
  },
};

/** Merge stored (possibly older) settings with defaults so new fields always exist. */
export function withDefaults(stored: Partial<Settings> | null | undefined): Settings {
  const s = stored ?? {};
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    fees: { ...DEFAULT_SETTINGS.fees, ...(s.fees ?? {}) },
    agentsEnabled: { ...DEFAULT_SETTINGS.agentsEnabled, ...(s.agentsEnabled ?? {}) },
    ai: { ...DEFAULT_SETTINGS.ai, ...(s.ai ?? {}) },
    formats: { ...DEFAULT_SETTINGS.formats, ...(s.formats ?? {}) },
    radar: { ...DEFAULT_SETTINGS.radar, ...(s.radar ?? {}) },
  };
}

export const VAULT_PROVIDERS = [
  { id: "anthropic", name: "Anthropic (Claude)", phase: 2 },
  { id: "openai", name: "OpenAI (images)", phase: 2 },
  { id: "replicate", name: "Replicate", phase: 2 },
  { id: "ideogram", name: "Ideogram", phase: 2 },
  { id: "etsy", name: "Etsy API (keystring:sharedsecret)", phase: 2 },
] as const;

export type VaultProvider = (typeof VAULT_PROVIDERS)[number]["id"];
