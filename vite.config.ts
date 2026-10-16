import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

// Stamp the build with its version and the latest update, shown in Settings → About.
function git(cmd: string): string | null {
  try {
    return execSync(`git ${cmd}`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || null;
  } catch {
    return null; // no git (e.g. a zip download) — fall back to build time
  }
}
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };
const build = {
  version: pkg.version,
  commit: git("rev-parse --short HEAD"),
  updatedAt: git("log -1 --format=%cI") ?? new Date().toISOString(),
  change: git("log -1 --no-merges --format=%s"),
  builtAt: new Date().toISOString(),
};

export default defineConfig({
  // BS_OFFLINE=1 runs locally without Cloudflare's remote AI binding (no login needed).
  plugins: [react(), tailwindcss(), cloudflare({ remoteBindings: !process.env.BS_OFFLINE })],
  define: { __BUILD_INFO__: JSON.stringify(build) },
});
