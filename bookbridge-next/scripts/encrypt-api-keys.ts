/**
 * One-off backfill: encrypt API keys saved before encryption at rest.
 *
 *   npm run encrypt-api-keys
 *
 * Needs DATABASE_URL and API_KEY_ENCRYPTION_KEY (read from .env.local / .env,
 * or the shell). Idempotent: safe to run more than once. Prints counts only.
 */
import { config } from 'dotenv'

config({ path: ['.env.local', '.env'], quiet: true })

async function main() {
  // Imported after dotenv so the Prisma client sees DATABASE_URL.
  const { default: prisma } = await import('@/lib/prisma')
  const { encryptLegacyApiKeys } = await import('@/lib/api-key-migration')
  try {
    const { scanned, encrypted } = await encryptLegacyApiKeys(prisma)
    console.log(`Checked ${scanned} stored API keys; encrypted ${encrypted} plaintext keys.`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err: unknown) => {
  console.error('Backfill failed:', err instanceof Error ? err.name : 'unknown error')
  process.exit(1)
})
