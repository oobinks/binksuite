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
});

export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  demoMode: true,
  theme: "system",
  fees: DEFAULT_FEES,
  minProfitPence: 250,
  monthlyTargetPence: 20000,
  dailyCapPence: 200,
  monthlyCapPence: 2000,
  toneOfVoice: "Warm, cosy and friendly — like a note from a favourite little shop. British spelling.",
  shopName: "My Printables Shop",
  agentsEnabled: Object.fromEntries(AGENTS.map((a) => [a.id, true])) as Record<AgentId, boolean>,
  blocklist: DEFAULT_BLOCKLIST,
  providerLicenceOk: false,
};

/** Merge stored (possibly older) settings with defaults so new fields always exist. */
export function withDefaults(stored: Partial<Settings> | null | undefined): Settings {
  const s = stored ?? {};
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    fees: { ...DEFAULT_SETTINGS.fees, ...(s.fees ?? {}) },
    agentsEnabled: { ...DEFAULT_SETTINGS.agentsEnabled, ...(s.agentsEnabled ?? {}) },
  };
}

export const VAULT_PROVIDERS = [
  { id: "anthropic", name: "Anthropic (Claude)", phase: 2 },
  { id: "openai", name: "OpenAI (images)", phase: 2 },
  { id: "replicate", name: "Replicate", phase: 2 },
  { id: "ideogram", name: "Ideogram", phase: 2 },
  { id: "etsy", name: "Etsy API key", phase: 4 },
] as const;

export type VaultProvider = (typeof VAULT_PROVIDERS)[number]["id"];
