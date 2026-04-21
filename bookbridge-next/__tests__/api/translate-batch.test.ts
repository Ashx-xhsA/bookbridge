import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkMiddleware: vi.fn(() => vi.fn()),
  createRouteMatcher: vi.fn(() => vi.fn()),
}))

const mockProjectFindUnique = vi.fn()
const mockChapterFindMany = vi.fn()

vi.mock('@/lib/prisma', () => ({
  default: {
    project: {
      findUnique: (...args: unknown[]) => mockProjectFindUnique(...args),
    },
    chapter: {
      findMany: (...args: unknown[]) => mockChapterFindMany(...args),
    },
  },
}))

import { auth } from '@clerk/nextjs/server'

const baseUrl = 'http://localhost:3000/api/projects/proj1/translate-batch'

function makeParams(): Promise<{ id: string }> {
  return Promise.resolve({ id: 'proj1' })
}

describe('GET /api/projects/[id]/translate-batch', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: null } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
    const { GET } = await import('@/app/api/projects/[id]/translate-batch/route')
    const req = new NextRequest(baseUrl)
    const res = await GET(req, { params: makeParams() })
    expect(res.status).toBe(401)
  })

  it('returns 404 when project not found', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: 'user_abc' } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
    mockProjectFindUnique.mockResolvedValueOnce(null)
    const { GET } = await import('@/app/api/projects/[id]/translate-batch/route')
    const req = new NextRequest(baseUrl)
    const res = await GET(req, { params: makeParams() })
    expect(res.status).toBe(404)
  })

  it('returns untranslated chapters', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: 'user_abc' } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
    mockProjectFindUnique.mockResolvedValueOnce({ ownerId: 'user_abc' })
    mockChapterFindMany.mockResolvedValueOnce([
      { id: 'ch1', number: 1, title: 'One', translation: 'Translated', sourceContent: 'text' },
      { id: 'ch2', number: 2, title: 'Two', translation: null, sourceContent: 'text' },
      { id: 'ch3', number: 3, title: 'Three', translation: null, sourceContent: null },
    ])

    const { GET } = await import('@/app/api/projects/[id]/translate-batch/route')
    const req = new NextRequest(baseUrl)
    const res = await GET(req, { params: makeParams() })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.total).toBe(3)
    expect(body.translated).toBe(1)
    expect(body.untranslated).toHaveLength(1)
    expect(body.untranslated[0].id).toBe('ch2')
  })
})
