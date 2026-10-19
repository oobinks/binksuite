// Real AI through Cloudflare Workers AI — included free (10,000 "neurons" a day)
// with every Cloudflare account, no API key needed.
// Every call is metered against the owner's daily cap so the free allowance is
// never exceeded; at the cap, agents show ⛔ and resume after midnight UTC.
import type { z } from "zod";
import type { DB } from "../db";
import { kvGet, kvSet } from "../lib/store";
import type { Settings } from "../../shared/settings";

export class AiLimitError extends Error {
  override name = "AiLimitError";
  constructor() {
    super("Today's free AI allowance is used up. Agents carry on after midnight (UTC).");
  }
}

/** Matches by name too, so it works across module copies. */
export const isAiLimit = (e: unknown) => e instanceof AiLimitError || (e as Error | null)?.name === "AiLimitError";

export interface JsonRequest<T> {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  /** Plain JSON Schema handed to the model's JSON mode. */
  jsonSchema: Record<string, unknown>;
  maxTokens?: number;
  /** Claude Code: a stable name for this request (otherwise it's worked out from the prompt). */
  key?: string;
  /** Claude Code: a short human label for Claude's to-do list. */
  label?: string;
}

export interface AiServices {
  /** Ask the text model for JSON matching `schema`. */
  json<T>(req: JsonRequest<T>): Promise<T>;
  /** Generate one image; returns base64-encoded JPEG. */
  image(prompt: string): Promise<string>;
  /** Claude Code only: a vector artwork as SVG text. When present, art is drawn instead of painted. */
  svg?(prompt: string): Promise<string>;
  /** Claude Code only: the same services, with requests linked to a task. */
  forTask?(task: { id: string; productId: string | null; title: string }): AiServices;
}

export interface AiUsage {
  day: string;
  calls: number;
  neurons: number;
}

const usageKey = (day: string) => `aiUsage:${day}`;
const today = () => new Date().toISOString().slice(0, 10);

export async function aiUsageToday(db: DB): Promise<AiUsage> {
  const day = today();
  return (await kvGet<AiUsage>(db, usageKey(day))) ?? { day, calls: 0, neurons: 0 };
}

async function addUsage(db: DB, neurons: number) {
  const u = await aiUsageToday(db);
  await kvSet(db, usageKey(u.day), { ...u, calls: u.calls + 1, neurons: Math.round(u.neurons + neurons) });
}

// Rough neuron estimates from Cloudflare's pricing page (October 2026).
// Text (Llama 3.3 70B fast): ~26.7k neurons per 1M input tokens, ~204.8k per 1M output tokens.
const TEXT_IN = 26_668 / 1e6;
const TEXT_OUT = 204_805 / 1e6;
// FLUX.1 schnell at 1024px, 4 steps: 4 tiles × 4.8 + 4 steps × 9.6.
export const IMAGE_NEURONS = 4 * 4.8 + 4 * 9.6;
/** Most a single call is allowed to use (text calls are capped by max_tokens). */
export const MAX_CALL_NEURONS = 400;
/** Rough cost of a whole product (research, brief, 4 images, listing) for the "products left today" hint. */
export const NEURONS_PER_PRODUCT = 3 * 450 + 4 * IMAGE_NEURONS;

/** Pull a JSON object out of a model reply (JSON mode usually returns clean JSON, but be forgiving). */
export function extractJson(reply: unknown): unknown {
  if (reply && typeof reply === "object") return reply;
  const text = String(reply ?? "");
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error("The AI didn't send back a readable answer. It'll try again.");
  }
}

export function workersAi(ai: Ai, db: DB, settings: Settings): AiServices {
  const guard = async (estimate: number) => {
    const u = await aiUsageToday(db);
    if (u.neurons + estimate > settings.ai.dailyNeuronCap) throw new AiLimitError();
  };
  const run = ai.run.bind(ai) as (model: string, input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  return {
    async json(req) {
      // Big answers (e.g. a spreadsheet design) cost more, so check there's room for the largest possible reply.
      await guard(Math.max(MAX_CALL_NEURONS, (req.maxTokens ?? 1200) * TEXT_OUT + 1500 * TEXT_IN));
      const res = await run(settings.ai.textModel, {
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.prompt },
        ],
        response_format: { type: "json_schema", json_schema: req.jsonSchema },
        max_tokens: req.maxTokens ?? 1200,
        temperature: 0.6,
      });
      const usage = res.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
      await addUsage(db, (usage?.prompt_tokens ?? 800) * TEXT_IN + (usage?.completion_tokens ?? 800) * TEXT_OUT);
      const parsed = req.schema.safeParse(extractJson(res.response));
      if (!parsed.success) throw new Error("The AI's answer was missing something. It'll try again.");
      return parsed.data;
    },
    async image(prompt) {
      await guard(IMAGE_NEURONS);
      const res = await run(settings.ai.imageModel, { prompt: prompt.slice(0, 2000), steps: 4 });
      await addUsage(db, IMAGE_NEURONS);
      if (typeof res.image !== "string" || !res.image) throw new Error("No image came back. It'll try again.");
      return res.image;
    },
  };
}
