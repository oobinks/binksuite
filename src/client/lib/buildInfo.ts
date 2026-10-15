// Filled in at build time by vite.config.ts.
declare const __BUILD_INFO__: {
  version: string;
  commit: string | null;
  /** When the latest change was made (the last commit). */
  updatedAt: string;
  /** One-line summary of the latest change. */
  change: string | null;
  /** When Cloudflare built this copy. */
  builtAt: string;
};

export const BUILD_INFO = __BUILD_INFO__;
