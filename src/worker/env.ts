export interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  ASSETS: Fetcher;
  /** Workers AI — free daily allowance on every Cloudflare account. */
  AI?: Ai;
  /** Local testing only: "1" swaps in a stand-in AI (see providers/fakeAi.ts). */
  FAKE_AI?: string;
  /** Signs the login cookie. Set as a Cloudflare secret. */
  SESSION_SECRET?: string;
  /** Encrypts Key Vault entries. Set as a Cloudflare secret. */
  VAULT_MASTER_KEY?: string;
}

/** Minimum secret length we accept — short secrets are easy to guess. */
export const MIN_SECRET_LENGTH = 32;

export function secretsStatus(env: Env) {
  return {
    sessionSecret: (env.SESSION_SECRET ?? "").length >= MIN_SECRET_LENGTH,
    vaultMasterKey: (env.VAULT_MASTER_KEY ?? "").length >= MIN_SECRET_LENGTH,
  };
}
