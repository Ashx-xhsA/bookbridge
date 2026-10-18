/**
 * User model API keys are encrypted at rest with AES-256-GCM. The ciphertext
 * is bound to the owner's Clerk id (GCM additional data), so a row copied into
 * another user's record cannot be decrypted there.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { decryptApiKey, encryptApiKey, isEncryptedApiKey } from '@/lib/api-key-crypto'

const TEST_KEY = process.env.API_KEY_ENCRYPTION_KEY

afterEach(() => {
  process.env.API_KEY_ENCRYPTION_KEY = TEST_KEY
})

describe('api key encryption', () => {
  it('round-trips a key for the same user', () => {
    const stored = encryptApiKey('sk-live-abc123', 'user_1')
    expect(decryptApiKey(stored, 'user_1')).toBe('sk-live-abc123')
  })

  it('stores a versioned ciphertext that never contains the plaintext', () => {
    const stored = encryptApiKey('sk-live-abc123', 'user_1')
    expect(stored.startsWith('enc:v1:')).toBe(true)
    expect(stored).not.toContain('sk-live-abc123')
    expect(isEncryptedApiKey(stored)).toBe(true)
  })

  it('uses a fresh IV every time', () => {
    expect(encryptApiKey('sk-same', 'user_1')).not.toBe(encryptApiKey('sk-same', 'user_1'))
  })

  it('refuses to decrypt for a different user', () => {
    const stored = encryptApiKey('sk-live-abc123', 'user_1')
    expect(() => decryptApiKey(stored, 'user_2')).toThrow()
  })

  it('detects tampering', () => {
    const stored = encryptApiKey('sk-live-abc123', 'user_1')
    const [iv, tag, ct] = stored.slice('enc:v1:'.length).split('.')
    const bytes = Buffer.from(ct, 'base64url')
    bytes[0] ^= 1
    const tampered = `enc:v1:${iv}.${tag}.${bytes.toString('base64url')}`
    expect(() => decryptApiKey(tampered, 'user_1')).toThrow()
    // A truncated tag is rejected rather than accepted as a weaker check.
    const short = Buffer.from(tag, 'base64url').subarray(0, 4).toString('base64url')
    expect(() => decryptApiKey(`enc:v1:${iv}.${short}.${ct}`, 'user_1')).toThrow()
  })

  it('rejects a legacy plaintext value instead of passing it through', () => {
    expect(isEncryptedApiKey('sk-legacy')).toBe(false)
    expect(() => decryptApiKey('sk-legacy', 'user_1')).toThrow()
  })

  it('throws when the encryption key is missing', () => {
    delete process.env.API_KEY_ENCRYPTION_KEY
    expect(() => encryptApiKey('sk-x', 'user_1')).toThrow(/API_KEY_ENCRYPTION_KEY/)
  })

  it('throws when the encryption key is not 32 bytes', () => {
    process.env.API_KEY_ENCRYPTION_KEY = Buffer.alloc(16).toString('base64')
    expect(() => encryptApiKey('sk-x', 'user_1')).toThrow(/32 bytes/)
  })

  it('never puts the key in an error message', () => {
    const stored = encryptApiKey('sk-live-abc123', 'user_1')
    try {
      decryptApiKey(stored, 'user_2')
    } catch (err) {
      expect(String(err)).not.toContain('sk-live-abc123')
    }
  })
})
