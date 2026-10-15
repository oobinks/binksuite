import { SELF, env } from "cloudflare:test";

export const BASE = "https://binksuite.test";
export const PASSWORD = "correct horse battery";

export class Client {
  cookie = "";
  async req<T = any>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
    const res = await SELF.fetch(BASE + path, {
      method,
      headers: { "content-type": "application/json", cookie: this.cookie, origin: BASE },
      body: body === undefined ? (method === "GET" ? undefined : "{}") : JSON.stringify(body),
    });
    const set = res.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0];
    const text = await res.text();
    return { status: res.status, data: text ? JSON.parse(text) : null };
  }
  get<T = any>(p: string) {
    return this.req<T>("GET", p);
  }
  post<T = any>(p: string, b?: unknown) {
    return this.req<T>("POST", p, b);
  }
  put<T = any>(p: string, b?: unknown) {
    return this.req<T>("PUT", p, b);
  }
  del<T = any>(p: string) {
    return this.req<T>("DELETE", p);
  }
}

export async function setUpOwner(): Promise<Client> {
  const c = new Client();
  const r = await c.post("/api/auth/setup", { password: PASSWORD, setupCode: (env as any).SESSION_SECRET });
  if (r.status !== 200) throw new Error(`setup failed: ${JSON.stringify(r.data)}`);
  return c;
}
