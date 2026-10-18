import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/**
 * Encryption at rest for users' model API keys (OWASP A02).
 *
 * AES-256-GCM with a random 96-bit IV per value. The owner's Clerk id is the
 * GCM additional data, so a ciphertext copied into another user's row will not
 * decrypt there. Stored format: `enc:v1:<iv>.<tag>.<ciphertext>` (base64url).
 * Server-only: the key lives in API_KEY_ENCRYPTION_KEY (32 bytes, base64).
 */

const PREFIX = 'enc:v1:'
const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const TAG_BYTES = 16

function encryptionKey(): Buffer {
  const raw = process.env.API_KEY_ENCRYPTION_KEY
  if (!raw) throw new Error('API_KEY_ENCRYPTION_KEY is not set')
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) {
    throw new Error('API_KEY_ENCRYPTION_KEY must be 32 bytes, base64-encoded')
  }
  return key
}

export function isEncryptedApiKey(stored: string): boolean {
  return stored.startsWith(PREFIX)
}

export function encryptApiKey(plaintext: string, ownerId: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv)
  cipher.setAAD(Buffer.from(ownerId, 'utf8'))
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const parts = [iv, cipher.getAuthTag(), ciphertext].map((b) => b.toString('base64url'))
  return PREFIX + parts.join('.')
}

/** Throws on anything that is not a valid ciphertext for this owner. */
export function decryptApiKey(stored: string, ownerId: string): string {
  if (!isEncryptedApiKey(stored)) throw new Error('API key is not encrypted')
  const parts = stored.slice(PREFIX.length).split('.')
  if (parts.length !== 3) throw new Error('Malformed encrypted API key')
  const [iv, tag, ciphertext] = parts.map((p) => Buffer.from(p, 'base64url'))
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error('Malformed encrypted API key')
  }
  // Pin the tag length so a truncated tag cannot weaken authentication.
  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), iv, { authTagLength: TAG_BYTES })
  decipher.setAAD(Buffer.from(ownerId, 'utf8'))
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}
