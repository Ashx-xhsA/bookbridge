import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkMiddleware: vi.fn(() => vi.fn()),
  createRouteMatcher: vi.fn(() => vi.fn()),
}))

const mockFindUnique = vi.fn()
const mockUpsert = vi.fn()

vi.mock('@/lib/prisma', () => ({
  default: {
    user: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      upsert: (...args: unknown[]) => mockUpsert(...args),
    },
  },
}))

const mockLookup = vi.fn()
vi.mock('node:dns/promises', () => ({
  lookup: (...args: unknown[]) => mockLookup(...args),
}))

import { auth } from '@clerk/nextjs/server'
import { decryptApiKey } from '@/lib/api-key-crypto'

const baseUrl = 'http://localhost:3000/api/settings'
type AuthReturn = Awaited<ReturnType<typeof auth>>

function patch(body: unknown) {
  return new NextRequest(baseUrl, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('GET /api/settings', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: null } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
    const { GET } = await import('@/app/api/settings/route')
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns user settings when authenticated', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: 'user_123' } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
    mockFindUnique.mockResolvedValueOnce({
      apiProvider: 'openai',
      apiBaseUrl: null,
      freeCharsUsed: 500,
      apiKey: 'sk-test',
    })
    const { GET } = await import('@/app/api/settings/route')
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.hasApiKey).toBe(true)
    expect(body).not.toHaveProperty('freeCharsUsed') // free tier removed in 1146c5a
    expect(body.apiProvider).toBe('openai')
  })

  it('returns defaults when user not found in DB', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: 'user_new' } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
    mockFindUnique.mockResolvedValueOnce(null)
    const { GET } = await import('@/app/api/settings/route')
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.hasApiKey).toBe(false)
    expect(body).not.toHaveProperty('freeCharsUsed')
  })
})

describe('PATCH /api/settings', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: null } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
    const { PATCH } = await import('@/app/api/settings/route')
    const req = new NextRequest(baseUrl, {
      method: 'PATCH',
      body: JSON.stringify({ apiProvider: 'claude' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PATCH(req)
    expect(res.status).toBe(401)
  })

  it('updates settings successfully', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: 'user_123' } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
    mockUpsert.mockResolvedValueOnce({
      apiProvider: 'claude',
      apiBaseUrl: null,
      freeCharsUsed: 0,
      apiKey: 'sk-new',
    })
    const { PATCH } = await import('@/app/api/settings/route')
    const req = new NextRequest(baseUrl, {
      method: 'PATCH',
      body: JSON.stringify({ apiProvider: 'claude', apiKey: 'sk-new' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PATCH(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.apiProvider).toBe('claude')
    expect(body.hasApiKey).toBe(true)
  })

  it('returns 400 for invalid body', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: 'user_123' } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
    const { PATCH } = await import('@/app/api/settings/route')
    const req = new NextRequest(baseUrl, {
      method: 'PATCH',
      body: JSON.stringify({ apiProvider: 'invalid_provider' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PATCH(req)
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/settings — API key encrypted at rest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue({ userId: 'user_123' } as AuthReturn)
    mockUpsert.mockImplementation(async (args: { update: Record<string, unknown> }) => ({
      apiProvider: 'openai',
      apiBaseUrl: null,
      apiKey: args.update.apiKey ?? null,
    }))
  })

  it('stores only ciphertext that decrypts for this user', async () => {
    const { PATCH } = await import('@/app/api/settings/route')
    const res = await PATCH(patch({ apiKey: 'sk-very-secret' }))
    expect(res.status).toBe(200)

    const args = mockUpsert.mock.calls[0][0]
    for (const stored of [args.update.apiKey, args.create.apiKey]) {
      expect(stored).not.toContain('sk-very-secret')
      expect(decryptApiKey(stored, 'user_123')).toBe('sk-very-secret')
    }
  })

  it('never returns the key, encrypted or not', async () => {
    const { PATCH } = await import('@/app/api/settings/route')
    const res = await PATCH(patch({ apiKey: 'sk-very-secret' }))
    const body = await res.json()
    expect(body).toEqual({ apiProvider: 'openai', apiBaseUrl: null, hasApiKey: true })
  })

  it('clears the key with null', async () => {
    const { PATCH } = await import('@/app/api/settings/route')
    await PATCH(patch({ apiKey: null }))
    expect(mockUpsert.mock.calls[0][0].update.apiKey).toBeNull()
  })

  it('returns a generic 500 when encryption is not configured', async () => {
    const saved = process.env.API_KEY_ENCRYPTION_KEY
    delete process.env.API_KEY_ENCRYPTION_KEY
    vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { PATCH } = await import('@/app/api/settings/route')
      const res = await PATCH(patch({ apiKey: 'sk-very-secret' }))
      expect(res.status).toBe(500)
      const text = await res.text()
      expect(text).not.toContain('API_KEY_ENCRYPTION_KEY')
      expect(text).not.toContain('sk-very-secret')
      expect(mockUpsert).not.toHaveBeenCalled()
    } finally {
      process.env.API_KEY_ENCRYPTION_KEY = saved
    }
  })
})

describe('PATCH /api/settings — apiBaseUrl SSRF guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue({ userId: 'user_123' } as AuthReturn)
    mockUpsert.mockResolvedValue({ apiProvider: 'custom', apiBaseUrl: 'x', apiKey: null })
    mockLookup.mockResolvedValue([{ address: '104.18.6.192', family: 4 }])
  })

  it('accepts a public https base URL', async () => {
    const { PATCH } = await import('@/app/api/settings/route')
    const res = await PATCH(patch({ apiProvider: 'custom', apiBaseUrl: 'https://api.example.com/v1' }))
    expect(res.status).toBe(200)
    expect(mockUpsert.mock.calls[0][0].update.apiBaseUrl).toBe('https://api.example.com/v1')
  })

  it.each([
    ['plain http', 'http://api.example.com/v1', '104.18.6.192'],
    ['cloud metadata', 'https://metadata.example/v1', '169.254.169.254'],
    ['private network', 'https://intranet.example/v1', '10.0.0.8'],
    ['literal loopback', 'https://127.0.0.1/v1', '127.0.0.1'],
  ])('rejects %s with 400 and does not save', async (_label, url, ip) => {
    mockLookup.mockResolvedValue([{ address: ip, family: 4 }])
    const { PATCH } = await import('@/app/api/settings/route')
    const res = await PATCH(patch({ apiProvider: 'custom', apiBaseUrl: url }))
    expect(res.status).toBe(400)
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('still allows clearing the base URL', async () => {
    const { PATCH } = await import('@/app/api/settings/route')
    const res = await PATCH(patch({ apiProvider: 'openai', apiBaseUrl: null }))
    expect(res.status).toBe(200)
    expect(mockLookup).not.toHaveBeenCalled()
  })
})
