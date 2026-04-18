import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkMiddleware: vi.fn(() => vi.fn()),
  createRouteMatcher: vi.fn(() => vi.fn()),
}))

const mockFindUnique = vi.fn()
const mockFindMany = vi.fn()
const mockCreate = vi.fn()

vi.mock('@/lib/prisma', () => ({
  default: {
    project: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
    glossaryTerm: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      create: (...args: unknown[]) => mockCreate(...args),
    },
  },
}))

import { auth } from '@clerk/nextjs/server'

const baseUrl = 'http://localhost:3000/api/projects/proj1/glossary'

function makeParams(): Promise<{ id: string }> {
  return Promise.resolve({ id: 'proj1' })
}

describe('GET /api/projects/[id]/glossary', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: null } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
    const { GET } = await import('@/app/api/projects/[id]/glossary/route')
    const req = new NextRequest(baseUrl)
    const res = await GET(req, { params: makeParams() })
    expect(res.status).toBe(401)
  })

  it('returns 404 when project not found', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: 'user_abc' } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
    mockFindUnique.mockResolvedValueOnce(null)
    const { GET } = await import('@/app/api/projects/[id]/glossary/route')
    const res = await GET(new NextRequest(baseUrl), { params: makeParams() })
    expect(res.status).toBe(404)
  })

  it('returns glossary terms', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: 'user_abc' } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
    mockFindUnique.mockResolvedValueOnce({ id: 'proj1', ownerId: 'user_abc' })
    const terms = [{ id: 't1', english: 'hello', translation: '你好' }]
    mockFindMany.mockResolvedValueOnce(terms)

    const { GET } = await import('@/app/api/projects/[id]/glossary/route')
    const res = await GET(new NextRequest(baseUrl), { params: makeParams() })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual(terms)
  })
})

describe('POST /api/projects/[id]/glossary', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a glossary term and returns 201', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: 'user_abc' } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
    mockFindUnique.mockResolvedValueOnce({ id: 'proj1', ownerId: 'user_abc' })
    const created = { id: 't2', english: 'bridge', translation: '桥', category: 'general' }
    mockCreate.mockResolvedValueOnce(created)

    const { POST } = await import('@/app/api/projects/[id]/glossary/route')
    const req = new NextRequest(baseUrl, {
      method: 'POST',
      body: JSON.stringify({ english: 'bridge', translation: '桥' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req, { params: makeParams() })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data.english).toBe('bridge')
  })

  it('returns 400 when english term is missing', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: 'user_abc' } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
    mockFindUnique.mockResolvedValueOnce({ id: 'proj1', ownerId: 'user_abc' })

    const { POST } = await import('@/app/api/projects/[id]/glossary/route')
    const req = new NextRequest(baseUrl, {
      method: 'POST',
      body: JSON.stringify({ translation: '桥' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req, { params: makeParams() })
    expect(res.status).toBe(400)
  })
})
