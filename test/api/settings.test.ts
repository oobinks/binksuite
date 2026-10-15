import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { setUpOwner } from "./helpers";

describe("settings and key vault", () => {
  it("saves partial settings and validates", async () => {
    const c = await setUpOwner();
    const r = await c.put("/api/settings", { theme: "dark", fees: { regulatoryRate: 0.005 } });
    expect(r.status).toBe(200);
    expect(r.data.theme).toBe("dark");
    expect(r.data.fees.regulatoryRate).toBe(0.005);
    expect(r.data.fees.transactionRate).toBe(0.065);
    expect((await c.put("/api/settings", { theme: "neon" })).status).toBe(400);
  });

  it("encrypts keys and only ever returns the last 4", async () => {
    const c = await setUpOwner();
    const r = await c.put("/api/vault/anthropic", { key: "sk-ant-secret-value-1234" });
    expect(r.status).toBe(200);
    expect(r.data).toMatchObject({ provider: "anthropic", last4: "1234" });
    const list = await c.get("/api/vault");
    expect(JSON.stringify(list.data)).not.toContain("secret-value");
    const row = await env.DB.prepare("SELECT ciphertext FROM vault").first<{ ciphertext: string }>();
    expect(row!.ciphertext).not.toContain("secret");
    const exp = await c.get("/api/export");
    expect(JSON.stringify(exp.data)).not.toContain(row!.ciphertext);
    await c.del("/api/vault/anthropic");
    expect((await c.get("/api/vault")).data.keys).toHaveLength(0);
  });

  it("toggles agents off", async () => {
    const c = await setUpOwner();
    await c.put("/api/settings", { agentsEnabled: { scout: false } });
    const s = (await c.get("/api/state")).data;
    expect(s.agents.find((a: any) => a.id === "scout").status).toBe("off");
  });

  it("reports storage", async () => {
    const c = await setUpOwner();
    await env.FILES.put("a.txt", "hello");
    const r = await c.get("/api/storage");
    expect(r.data).toMatchObject({ bytes: 5, objects: 1 });
  });
});
