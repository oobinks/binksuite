// Product file uploads: packs, pictures, and the spreadsheet and PDF buyers download.
import { describe, expect, it } from "vitest";
import { SELF, env } from "cloudflare:test";
import { getDb } from "../../src/worker/db";
import { getSettings } from "../../src/worker/lib/store";
import { suggestIdea } from "../../src/worker/engine/queue";
import { BASE, setUpOwner } from "./helpers";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

describe("uploads", () => {
  it("accepts the .xlsx and .pdf files a build saves, as well as packs and pictures", async () => {
    const c = await setUpOwner();
    const db = getDb(env.DB);
    const p = await suggestIdea(db, await getSettings(db), "Budget planner", undefined, true, { format: "excel" });
    const put = (name: string, type: string, origin: string | null = BASE) =>
      SELF.fetch(`${BASE}/api/files/products/${p.id}/${name}`, {
        method: "PUT",
        headers: { "content-type": type, cookie: c.cookie, ...(origin ? { origin } : {}), "content-length": "5" },
        body: "hello",
      });
    for (const [name, type] of [["a.xlsx", XLSX], ["a.pdf", "application/pdf"], ["a.zip", "application/zip"], ["a.jpg", "image/jpeg"]]) {
      const r = await put(name, type);
      expect(r.status, name).toBe(200);
      expect(await env.FILES.get(`products/${p.id}/${name}`)).not.toBeNull();
    }
    // Still blocked: other types, and uploads without a same-site origin.
    expect((await put("a.txt", "text/plain")).status).toBe(415);
    expect((await put("b.pdf", "application/pdf", null)).status).toBe(403);
  });
});
