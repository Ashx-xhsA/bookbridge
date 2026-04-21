import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkMiddleware: vi.fn(() => vi.fn()),
  createRouteMatcher: vi.fn(() => vi.fn()),
}))

const mockUserFindUnique = vi.fn()
const mockProjectFindUnique = vi.fn()
const mockGlossaryCreateMany = vi.fn()
const mockWorkerFetch = vi.fn()

vi.mock('@/lib/prisma', () => ({
  default: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
    },
    project: {
      findUnique: (...args: unknown[]) => mockProjectFindUnique(...args),
    },
    glossaryTerm: {
      createMany: (...args: unknown[]) => mockGlossaryCreateMany(...args),
    },
  },
}))

vi.mock('@/lib/worker', () => ({
  workerFetch: (...args: unknown[]) => mockWorkerFetch(...args),
}))

import { auth } from '@clerk/nextjs/server'

const baseUrl = 'http://localhost:3000/api/projects/proj1/glossary/extract'

function makeParams(): Promise<{ id: string }> {
  return Promise.resolve({ id: 'proj1' })
}

describe('POST /api/projects/[id]/glossary/extract', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: null } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
    const { POST } = await import('@/app/api/projects/[id]/glossary/extract/route')
    const req = new NextRequest(baseUrl, { method: 'POST' })
    const res = await POST(req, { params: makeParams() })
    expect(res.status).toBe(401)
  })

  it('returns 402 when user has no API key', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: 'user_abc' } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
    mockUserFindUnique.mockResolvedValueOnce({ apiKey: null })
    const { POST } = await import('@/app/api/projects/[id]/glossary/extract/route')
    const req = new NextRequest(baseUrl, { method: 'POST' })
    const res = await POST(req, { params: makeParams() })
    expect(res.status).toBe(402)
  })

  it('returns 404 when project not found', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: 'user_abc' } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
    mockUserFindUnique.mockResolvedValueOnce({ apiKey: 'sk-test' })
    mockProjectFindUnique.mockResolvedValueOnce(null)
    const { POST } = await import('@/app/api/projects/[id]/glossary/extract/route')
    const req = new NextRequest(baseUrl, { method: 'POST' })
    const res = await POST(req, { params: makeParams() })
    expect(res.status).toBe(404)
  })

  it('extracts glossary terms and skips duplicates', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: 'user_abc' } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
    mockUserFindUnique.mockResolvedValueOnce({ apiKey: 'sk-test' })
    mockProjectFindUnique.mockResolvedValueOnce({
      id: 'proj1',
      ownerId: 'user_abc',
      targetLang: 'zh-Hans',
      chapters: [{ sourceContent: 'The Little Prince lived on asteroid B-612.' }],
      glossary: [{ english: 'Little Prince' }],
    })
    mockWorkerFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          terms: [
            { english: 'Little Prince', translation: '小王子', category: 'character' },
            { english: 'asteroid B-612', translation: 'B-612小行星', category: 'place' },
          ],
        }),
    })
    mockGlossaryCreateMany.mockResolvedValueOnce({ count: 1 })

    const { POST } = await import('@/app/api/projects/[id]/glossary/extract/route')
    const req = new NextRequest(baseUrl, { method: 'POST' })
    const res = await POST(req, { params: makeParams() })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.extracted).toBe(1)
    expect(body.skipped).toBe(1)
  })
})
