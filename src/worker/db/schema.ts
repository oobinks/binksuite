// D1 schema (Drizzle). Run `npx drizzle-kit generate` after editing to add a migration.
// The Worker applies pending migrations itself on first request (see migrate.ts),
// so the owner never has to run a migration command.
//
// `demo` columns: rows created by the demo simulator / while demo mode is on.
// Turning demo mode off hides them; "Clear demo data" deletes them.
import { sqliteTable, text, integer, real, index, primaryKey } from "drizzle-orm/sqlite-core";

export const owner = sqliteTable("owner", {
  id: integer("id").primaryKey(),
  passwordHash: text("password_hash").notNull(),
  salt: text("salt").notNull(),
  iterations: integer("iterations").notNull(),
  sessionVersion: integer("session_version").notNull().default(1),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: text("locked_until"),
  createdAt: text("created_at").notNull(),
});

/** Small key/value store: settings, last briefing date, demo clock. */
export const kv = sqliteTable("kv", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const products = sqliteTable("products", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  niche: text("niche").notNull(),
  /** Pipeline room the product is currently in, or "live". */
  stage: text("stage").notNull(),
  seed: integer("seed").notNull(),
  pricePence: integer("price_pence"),
  data: text("data", { mode: "json" }).$type<Record<string, unknown>>().notNull().default({}),
  demo: integer("demo", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    productId: text("product_id"),
    room: text("room").notNull(),
    agent: text("agent"),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    state: text("state").notNull(),
    progress: real("progress").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    needsApproval: integer("needs_approval", { mode: "boolean" }).notNull().default(true),
    input: text("input", { mode: "json" }).$type<Record<string, unknown>>().notNull().default({}),
    output: text("output", { mode: "json" }).$type<Record<string, unknown> | null>(),
    note: text("note"),
    error: text("error"),
    durationMs: integer("duration_ms").notNull().default(0),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
    /** While a real-AI job runs, other ticks leave the task alone until this time. */
    leaseUntil: text("lease_until"),
    demo: integer("demo", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("tasks_state_idx").on(t.state, t.finishedAt), index("tasks_room_idx").on(t.room, t.state), index("tasks_agent_idx").on(t.agent)],
);

/** Guardrail record: anything that publishes, sends, overspends or deletes needs one. */
export const approvals = sqliteTable("approvals", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull(),
  kind: text("kind").notNull(),
  summary: text("summary").notNull(),
  status: text("status").notNull(),
  note: text("note"),
  demo: integer("demo", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  decidedAt: text("decided_at"),
});

export const activity = sqliteTable(
  "activity",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    agent: text("agent"),
    room: text("room"),
    kind: text("kind").notNull(),
    message: text("message").notNull(),
    demo: integer("demo", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("activity_agent_idx").on(t.agent, t.id), index("activity_room_idx").on(t.room, t.id)],
);

/** Parcels moving between rooms. The map animates new rows. */
export const handoffs = sqliteTable("handoffs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: text("product_id"),
  fromRoom: text("from_room").notNull(),
  toRoom: text("to_room").notNull(),
  demo: integer("demo", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
});

/** Money. Sales positive; fees, costs and API spend negative. */
export const ledger = sqliteTable(
  "ledger",
  {
    id: text("id").primaryKey(),
    date: text("date").notNull(),
    kind: text("kind").notNull(), // sale | fee | cost | api | refund
    category: text("category").notNull(),
    description: text("description").notNull(),
    amountPence: integer("amount_pence").notNull(),
    nonGbp: integer("non_gbp", { mode: "boolean" }).notNull().default(false),
    productId: text("product_id"),
    saleId: text("sale_id"),
    demo: integer("demo", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("ledger_date_idx").on(t.date), index("ledger_kind_date_idx").on(t.kind, t.date)],
);

export const events = sqliteTable(
  "events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    type: text("type").notNull(),
    amount: integer("amount").notNull().default(1),
    demo: integer("demo", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("events_type_idx").on(t.type, t.createdAt)],
);

export const xpLog = sqliteTable("xp_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  amount: integer("amount").notNull(),
  reason: text("reason").notNull(),
  demo: integer("demo", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
});

export const questClaims = sqliteTable(
  "quest_claims",
  {
    questId: text("quest_id").notNull(),
    periodKey: text("period_key").notNull(),
    demo: integer("demo", { mode: "boolean" }).notNull().default(false),
    claimedAt: text("claimed_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.questId, t.periodKey, t.demo] })],
);

export const achievements = sqliteTable(
  "achievements",
  {
    id: text("id").notNull(),
    demo: integer("demo", { mode: "boolean" }).notNull().default(false),
    unlockedAt: text("unlocked_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.id, t.demo] })],
);

/** Things the browser should celebrate: level-ups, achievements, sales, quest completions. */
export const notifications = sqliteTable("notifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  demo: integer("demo", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
});

/** Encrypted API keys (AES-GCM, key from the VAULT_MASTER_KEY secret). */
export const vault = sqliteTable("vault", {
  provider: text("provider").primaryKey(),
  ciphertext: text("ciphertext").notNull(),
  iv: text("iv").notNull(),
  last4: text("last4").notNull(),
  updatedAt: text("updated_at").notNull(),
});
