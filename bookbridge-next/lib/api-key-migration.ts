import { encryptApiKey, isEncryptedApiKey } from '@/lib/api-key-crypto'

interface UserKeyStore {
  user: {
    findMany(args: {
      where: { apiKey: { not: null } }
      select: { id: true; clerkId: true; apiKey: true }
    }): Promise<{ id: string; clerkId: string; apiKey: string | null }[]>
    updateMany(args: {
      where: { id: string; apiKey: string }
      data: { apiKey: string }
    }): Promise<{ count: number }>
  }
}

/**
 * Encrypt every API key still stored in plaintext (rows saved before
 * encryption at rest). Idempotent: already-encrypted rows are skipped, and a
 * row is only overwritten if its key has not changed since it was read.
 */
export async function encryptLegacyApiKeys(
  db: UserKeyStore
): Promise<{ scanned: number; encrypted: number }> {
  const rows = await db.user.findMany({
    where: { apiKey: { not: null } },
    select: { id: true, clerkId: true, apiKey: true },
  })
  let encrypted = 0
  for (const row of rows) {
    if (!row.apiKey || isEncryptedApiKey(row.apiKey)) continue
    const { count } = await db.user.updateMany({
      where: { id: row.id, apiKey: row.apiKey },
      data: { apiKey: encryptApiKey(row.apiKey, row.clerkId) },
    })
    encrypted += count
  }
  return { scanned: rows.length, encrypted }
}
