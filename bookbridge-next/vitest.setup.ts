import '@testing-library/jest-dom/vitest'

process.env.WORKER_URL ??= 'http://worker.test'
// Fixed 32-byte test key for lib/api-key-crypto (never used outside tests).
process.env.API_KEY_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString('base64')
