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

import { auth } from '@clerk/nextjs/server'

const baseUrl = 'http://localhost:3000/api/settings'

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
    expect(body.freeCharsUsed).toBe(500)
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
    expect(body.freeCharsUsed).toBe(0)
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
