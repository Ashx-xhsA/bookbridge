import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkMiddleware: vi.fn(() => vi.fn()),
  createRouteMatcher: vi.fn(() => vi.fn()),
}))

const mockProjectFindUnique = vi.fn()
const mockChapterUpdate = vi.fn()
const mockWorkerFetch = vi.fn()

vi.mock('@/lib/prisma', () => ({
  default: {
    project: {
      findUnique: (...args: unknown[]) => mockProjectFindUnique(...args),
    },
    chapter: {
      update: (...args: unknown[]) => mockChapterUpdate(...args),
    },
  },
}))

vi.mock('@/lib/worker', () => ({
  workerFetch: (...args: unknown[]) => mockWorkerFetch(...args),
}))

import { auth } from '@clerk/nextjs/server'

const baseUrl = 'http://localhost:3000/api/projects/proj1/summarize'

function makeParams(): Promise<{ id: string }> {
  return Promise.resolve({ id: 'proj1' })
}

describe('POST /api/projects/[id]/summarize', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: null } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
    const { POST } = await import('@/app/api/projects/[id]/summarize/route')
    const req = new NextRequest(baseUrl, { method: 'POST' })
    const res = await POST(req, { params: makeParams() })
    expect(res.status).toBe(401)
  })

  it('returns 404 when project not found', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: 'user_abc' } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
    mockProjectFindUnique.mockResolvedValueOnce(null)
    const { POST } = await import('@/app/api/projects/[id]/summarize/route')
    const req = new NextRequest(baseUrl, { method: 'POST' })
    const res = await POST(req, { params: makeParams() })
    expect(res.status).toBe(404)
  })

  it('returns 403 when user does not own project', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: 'user_abc' } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
    mockProjectFindUnique.mockResolvedValueOnce({
      id: 'proj1',
      ownerId: 'user_other',
      chapters: [],
    })
    const { POST } = await import('@/app/api/projects/[id]/summarize/route')
    const req = new NextRequest(baseUrl, { method: 'POST' })
    const res = await POST(req, { params: makeParams() })
    expect(res.status).toBe(403)
  })

  it('returns count 0 when all chapters have summaries', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: 'user_abc' } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
    mockProjectFindUnique.mockResolvedValueOnce({
      id: 'proj1',
      ownerId: 'user_abc',
      chapters: [
        { id: 'ch1', sourceContent: 'text', summary: 'existing summary' },
      ],
    })
    const { POST } = await import('@/app/api/projects/[id]/summarize/route')
    const req = new NextRequest(baseUrl, { method: 'POST' })
    const res = await POST(req, { params: makeParams() })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.count).toBe(0)
  })

  it('generates summaries for chapters without them', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: 'user_abc' } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
    mockProjectFindUnique.mockResolvedValueOnce({
      id: 'proj1',
      ownerId: 'user_abc',
      chapters: [
        { id: 'ch1', sourceContent: 'Chapter one content', summary: null },
      ],
    })
    mockWorkerFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ summary: 'A summary of chapter one.' }),
    })
    mockChapterUpdate.mockResolvedValueOnce({})

    const { POST } = await import('@/app/api/projects/[id]/summarize/route')
    const req = new NextRequest(baseUrl, { method: 'POST' })
    const res = await POST(req, { params: makeParams() })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.count).toBe(1)
    expect(body.results[0].summary).toBe('A summary of chapter one.')
  })
})
