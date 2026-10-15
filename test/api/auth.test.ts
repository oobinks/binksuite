import { describe, expect, it } from "vitest";
import { SELF } from "cloudflare:test";
import { Client, PASSWORD, setUpOwner, BASE } from "./helpers";

describe("auth", () => {
  it("starts with no password and secrets present", async () => {
    const c = new Client();
    const r = await c.get("/api/auth/status");
    expect(r.status).toBe(200);
    expect(r.data).toMatchObject({ passwordSet: false, authed: false, secrets: { sessionSecret: true, vaultMasterKey: true } });
  });

  it("refuses setup without the right setup code", async () => {
    const c = new Client();
    const r = await c.post("/api/auth/setup", { password: PASSWORD, setupCode: "nope" });
    expect(r.status).toBe(403);
  });

  it("rejects short passwords", async () => {
    const c = new Client();
    const r = await c.post("/api/auth/setup", { password: "short", setupCode: "x" });
    expect(r.status).toBe(400);
  });

  it("sets up, protects the API, logs in and out", async () => {
    const owner = await setUpOwner();
    expect((await owner.get("/api/auth/status")).data.authed).toBe(true);

    const stranger = new Client();
    expect((await stranger.get("/api/state")).status).toBe(401);
    expect((await stranger.post("/api/auth/setup", { password: PASSWORD, setupCode: "x" })).status).toBe(409);

    const bad = await stranger.post("/api/auth/login", { password: "wrong password!" });
    expect(bad.status).toBe(401);
    expect(bad.data.error).toMatch(/tries left/);

    const ok = await stranger.post("/api/auth/login", { password: PASSWORD });
    expect(ok.status).toBe(200);
    expect(stranger.cookie).toMatch(/^bs_session=/);
    expect((await stranger.get("/api/state")).status).toBe(200);

    await stranger.post("/api/auth/logout");
    expect((await stranger.get("/api/state")).status).toBe(401);
  });

  it("locks out after 5 wrong passwords", async () => {
    await setUpOwner();
    const c = new Client();
    for (let i = 0; i < 5; i++) await c.post("/api/auth/login", { password: "wrong wrong wrong" });
    const r = await c.post("/api/auth/login", { password: PASSWORD });
    expect(r.status).toBe(429);
  });

  it("blocks cross-site and non-JSON writes", async () => {
    const owner = await setUpOwner();
    const cross = await SELF.fetch(BASE + "/api/auth/logout-all", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: owner.cookie, origin: "https://evil.example" },
      body: "{}",
    });
    expect(cross.status).toBe(403);
    const form = await SELF.fetch(BASE + "/api/auth/logout-all", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", cookie: owner.cookie },
      body: "a=1",
    });
    expect(form.status).toBe(415);
  });

  it("changing the password logs out other sessions", async () => {
    const a = await setUpOwner();
    const b = new Client();
    await b.post("/api/auth/login", { password: PASSWORD });
    const r = await a.post("/api/auth/password", { current: PASSWORD, next: "a brand new password" });
    expect(r.status).toBe(200);
    expect((await a.get("/api/state")).status).toBe(200);
    expect((await b.get("/api/state")).status).toBe(401);
  });
});
