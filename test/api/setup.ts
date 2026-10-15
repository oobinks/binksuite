// Each test starts from an empty database (schema kept) and an empty bucket.
import { beforeEach } from "vitest";
import { env } from "cloudflare:test";

beforeEach(async () => {
  const { results } = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('d1_migrations','_cf_KV','_cf_METADATA')",
  ).all<{ name: string }>();
  if (results.length) await env.DB.batch(results.map((r) => env.DB.prepare(`DELETE FROM "${r.name}"`)));
  const listed = await env.FILES.list();
  for (const o of listed.objects) await env.FILES.delete(o.key);
});
