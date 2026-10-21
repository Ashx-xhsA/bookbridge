/**
 * One-off backfill: encrypt API keys stored before encryption at rest landed.
 * Idempotent, so re-running it is safe.
 */
import { describe, expect, it, vi } from 'vitest'
import { decryptApiKey, encryptApiKey } from '@/lib/api-key-crypto'
import { encryptLegacyApiKeys } from '@/lib/api-key-migration'

function fakeDb(rows: { id: string; clerkId: string; apiKey: string | null }[]) {
  return {
    user: {
      findMany: vi.fn().mockResolvedValue(rows.filter((r) => r.apiKey !== null)),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  }
}

describe('encryptLegacyApiKeys', () => {
  it('encrypts plaintext rows and leaves encrypted ones alone', async () => {
    const already = encryptApiKey('sk-new', 'user_b')
    const db = fakeDb([
      { id: 'a', clerkId: 'user_a', apiKey: 'sk-legacy' },
      { id: 'b', clerkId: 'user_b', apiKey: already },
    ])

    const result = await encryptLegacyApiKeys(db)

    expect(result).toEqual({ scanned: 2, encrypted: 1 })
    expect(db.user.updateMany).toHaveBeenCalledTimes(1)
    const call = db.user.updateMany.mock.calls[0][0]
    // Only overwrite the row if nobody changed the key in the meantime.
    expect(call.where).toEqual({ id: 'a', apiKey: 'sk-legacy' })
    expect(call.data.apiKey).not.toContain('sk-legacy')
    expect(decryptApiKey(call.data.apiKey, 'user_a')).toBe('sk-legacy')
  })

  it('only selects rows that have a key', async () => {
    const db = fakeDb([])
    await encryptLegacyApiKeys(db)
    expect(db.user.findMany).toHaveBeenCalledWith({
      where: { apiKey: { not: null } },
      select: { id: true, clerkId: true, apiKey: true },
    })
  })

  it('is a no-op when everything is already encrypted', async () => {
    const db = fakeDb([{ id: 'a', clerkId: 'user_a', apiKey: encryptApiKey('sk', 'user_a') }])
    expect(await encryptLegacyApiKeys(db)).toEqual({ scanned: 1, encrypted: 0 })
    expect(db.user.updateMany).not.toHaveBeenCalled()
  })
})
