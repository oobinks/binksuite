// Applies migrations/*.sql on first request per isolate. Uses the same
// `d1_migrations` table as `wrangler d1 migrations apply`, so both stay in sync.
const files = import.meta.glob("../../../migrations/*.sql", { query: "?raw", import: "default", eager: true }) as Record<
  string,
  string
>;

const MIGRATIONS = Object.entries(files)
  .map(([path, sql]) => ({ name: path.split("/").pop()!, sql }))
  .sort((a, b) => a.name.localeCompare(b.name));

let ready: Promise<void> | null = null;

export function ensureMigrated(db: D1Database): Promise<void> {
  ready ??= applyMigrations(db).then(
    () => undefined,
    (e) => {
      ready = null;
      throw e;
    },
  );
  return ready;
}

export async function applyMigrations(db: D1Database): Promise<string[]> {
  await db
    .prepare(
      "CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)",
    )
    .run();
  const { results } = await db.prepare("SELECT name FROM d1_migrations").all<{ name: string }>();
  const done = new Set(results.map((r) => r.name));
  const applied: string[] = [];
  for (const m of MIGRATIONS) {
    if (done.has(m.name)) continue;
    const statements = m.sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => db.prepare(s));
    statements.push(db.prepare("INSERT INTO d1_migrations (name) VALUES (?)").bind(m.name));
    await db.batch(statements);
    applied.push(m.name);
  }
  return applied;
}
