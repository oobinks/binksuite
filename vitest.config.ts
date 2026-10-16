import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-plugin";

export default defineConfig({
  test: {
    projects: [
      {
        test: { name: "unit", include: ["test/unit/**/*.test.ts"], environment: "node" },
      },
      {
        plugins: [
          cloudflareTest({
            main: "./src/worker/index.ts",
            wrangler: { configPath: "./wrangler.test.jsonc" },
            miniflare: {
              bindings: {
                SESSION_SECRET: "test-session-secret-0123456789abcdefghijkl",
                VAULT_MASTER_KEY: "test-vault-master-key-0123456789abcdefghij",
                // Tests choose their AI explicitly; never pick up a local FAKE_AI switch.
                FAKE_AI: "",
              },
            },
          }),
        ],
        test: { name: "api", include: ["test/api/**/*.test.ts"], setupFiles: ["./test/api/setup.ts"] },
      },
    ],
  },
});
