// BinkSuite Worker: serves the React app (static assets) and the /api.
import { HTTPException } from "hono/http-exception";
import { newApp, HttpError, dbFor } from "./app";
import type { Env } from "./env";
import { ensureMigrated } from "./db/migrate";
import { getSettings } from "./lib/store";
import { authRoutes, isAuthed } from "./routes/auth";
import { hqRoutes } from "./routes/hq";
import { financeRoutes } from "./routes/finance";
import { settingsRoutes } from "./routes/settings";
import { runCron } from "./cron";

const app = newApp();

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status as 400);
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: "Something went wrong on our side. Try again in a moment." }, 500);
});

app.use("/api/*", async (c, next) => {
  // Basic CSRF protection: state-changing requests must be same-origin JSON.
  if (c.req.method !== "GET" && c.req.method !== "HEAD") {
    const origin = c.req.header("origin");
    if (origin && new URL(origin).host !== new URL(c.req.url).host) throw new HttpError(403, "Cross-site request blocked");
    const ct = c.req.header("content-type") ?? "";
    if (!ct.includes("application/json")) throw new HttpError(415, "Send JSON");
  }
  await ensureMigrated(c.env.DB);
  const db = dbFor(c.env);
  c.set("db", db);
  c.set("settings", await getSettings(db));
  c.header("Cache-Control", "no-store");
  await next();
});

app.route("/api/auth", authRoutes);

// Everything below requires a logged-in owner.
app.use("/api/*", async (c, next) => {
  if (!(await isAuthed(c))) throw new HttpError(401, "Please log in");
  await next();
});

app.route("/api", hqRoutes);
app.route("/api/finance", financeRoutes);
app.route("/api", settingsRoutes);

app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));

export default {
  fetch: app.fetch,
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runCron(env));
  },
} satisfies ExportedHandler<Env>;

export { app };
