import type { AgentId, RoomId } from "../../../shared/registry";
import type { Settings } from "../../../shared/settings";
import type { schema } from "../../db";

export type TaskRow = typeof schema.tasks.$inferSelect;
export type ProductRow = typeof schema.products.$inferSelect;

export interface StepContext {
  task: TaskRow;
  product: ProductRow;
  settings: Settings;
  /** Seeded from the product + task, so demo output is stable. */
  rng: () => number;
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
  needsApproval: boolean;
  /** What approving means — shown on the approval record. */
  approvalKind: "review" | "publish" | "spend" | "send" | "delete";
  /** Demo work takes a while so you can watch the progress bar. */
  durationMs: [number, number];
  /** Rough API cost for the spend-cap check, in pence. */
  estimatedCostPence: number;
  title(product: ProductRow): string;
  run(ctx: StepContext): StepResult | Promise<StepResult>;
  /** Next step kind after approval / auto-finish; null = product goes live. */
  next: string | null;
  /** Rejecting sends the product back to this step instead of redoing this one. */
  rejectTo?: string;
  /** Return an error message to refuse an approval (e.g. failing compliance without an override note). */
  canApprove?(task: TaskRow, note: string | undefined): string | null;
}
