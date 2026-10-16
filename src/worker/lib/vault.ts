// Read a decrypted API key from the Key Vault, inside the Worker only.
import { eq } from "drizzle-orm";
import type { DB } from "../db";
import { vault } from "../db/schema";
import type { Env } from "../env";
import { decryptSecret } from "./crypto";

export async function vaultSecret(db: DB, env: Env, provider: string): Promise<string | null> {
  if (!env.VAULT_MASTER_KEY) return null;
  const row = await db.select().from(vault).where(eq(vault.provider, provider)).get();
  if (!row) return null;
  try {
    return await decryptSecret(row.ciphertext, row.iv, env.VAULT_MASTER_KEY);
  } catch {
    return null; // master key changed: the owner will need to re-enter it
  }
}
