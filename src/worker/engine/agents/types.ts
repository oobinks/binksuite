import type { AgentId, RoomId } from "../../../shared/registry";
import type { Settings } from "../../../shared/settings";
import type { schema } from "../../db";
import type { AiServices } from "../../providers/ai";

export type TaskRow = typeof schema.tasks.$inferSelect;
export type ProductRow = typeof schema.products.$inferSelect;

export interface StepContext {
  task: TaskRow;
  product: ProductRow;
  settings: Settings;
  /** Seeded from the product + task, so demo output is stable. */
  rng: () => number;
}

/** Real work needs the AI and the file bucket. */
export interface RealContext extends StepContext {
  ai: AiServices;
  files: R2Bucket;
}

/** A long job (e.g. 4 images) can report progress and finish over several ticks. */
export interface PartialResult {
  partial: Record<string, unknown>;
  progress: number;
  log?: string;
}

export interface StepResult {
  output: Record<string, unknown>;
  /** Merged into product.data (and title/price when set). */
  productData?: Record<string, unknown>;
  productTitle?: string;
  pricePence?: number;
  /** API spend for this step, in pence. Logged to the ledger. */
  costPence?: number;
  log: string;
}

/**
 * One step of the product pipeline, done by one agent in one room.
 * The owner (agent = null) does the Launch Pad step.
 */
export interface StepDef {
  kind: string;
  agent: AgentId | null;
  room: RoomId;
  /** If true the result waits for the owner (❗). Otherwise it hands off automatically. */
  needsApproval: boolean | ((product: ProductRow) => boolean);
  /** What approving means — shown on the approval record. */
  approvalKind: "review" | "publish" | "spend" | "send" | "delete";
  /** Demo work takes a while so you can watch the progress bar. */
  durationMs: [number, number];
  /** Rough API cost for the spend-cap check, in pence. */
  estimatedCostPence: number;
  title(product: ProductRow): string;
  run(ctx: StepContext): StepResult | Promise<StepResult>;
  /** Real version for real (non-demo) products. Steps without one use `run` (already real logic). */
  real?(ctx: RealContext): Promise<StepResult | PartialResult>;
  /** Roughly how long the real job takes, for the progress bar. */
  realSeconds?: number;
  /** Validate the owner's choices on approval (e.g. which images to keep) and turn them into product data. */
  onApprove?(
    task: TaskRow,
    product: ProductRow,
    data: Record<string, unknown> | undefined,
  ): { productData?: Record<string, unknown>; pricePence?: number; error?: string };
  /** Not part of the product pipeline (e.g. Price Watch alerts): approving just closes it. */
  standalone?: boolean;
  /** Next step kind after approval / auto-finish; null = product goes live. */
  next: string | null;
  /** Pick the next step per product (e.g. spreadsheets skip the art steps). Falls back to `next`. */
  nextFor?(product: ProductRow): string | null;
  /** Rejecting sends the product back to this step instead of redoing this one. */
  rejectTo?: string;
  /** Return an error message to refuse an approval (e.g. failing compliance without an override note). */
  canApprove?(task: TaskRow, note: string | undefined): string | null;
}
