import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkMiddleware: vi.fn(() => vi.fn()),
  createRouteMatcher: vi.fn(() => vi.fn()),
}))

const mockJobCreate = vi.fn()
const mockProjectFindUnique = vi.fn()
const mockGlobalFetch = vi.fn()

vi.mock('@/lib/prisma', () => ({
  default: {
    translationJob: {
      create: (...args: unknown[]) => mockJobCreate(...args),
    },
    project: {
      findUnique: (...args: unknown[]) => mockProjectFindUnique(...args),
    },
  },
}))

vi.stubGlobal('fetch', mockGlobalFetch)

import { auth } from '@clerk/nextjs/server'

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/jobs', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/jobs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGlobalFetch.mockResolvedValue(new Response('ok'))
  })

  it('returns 401 when user is not authenticated', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: null } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
    const { POST } = await import('@/app/api/jobs/route')
    const res = await POST(makeRequest({ projectId: 'p1' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when projectId is missing', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: 'user_abc' } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
    const { POST } = await import('@/app/api/jobs/route')
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('projectId')
  })

  it('returns 404 when project does not exist', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: 'user_abc' } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
    mockProjectFindUnique.mockResolvedValueOnce(null)
    const { POST } = await import('@/app/api/jobs/route')
    const res = await POST(makeRequest({ projectId: 'missing' }))
    expect(res.status).toBe(404)
  })

  it('returns 403 when user does not own the project', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: 'user_abc' } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
    mockProjectFindUnique.mockResolvedValueOnce({ id: 'p1', ownerId: 'other_user' })
    const { POST } = await import('@/app/api/jobs/route')
    const res = await POST(makeRequest({ projectId: 'p1' }))
    expect(res.status).toBe(403)
  })

  it('creates a job and returns 201', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: 'user_abc' } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
    mockProjectFindUnique.mockResolvedValueOnce({ id: 'p1', ownerId: 'user_abc' })
    mockJobCreate.mockResolvedValueOnce({ id: 'j1', status: 'QUEUED' })

    const { POST } = await import('@/app/api/jobs/route')
    const res = await POST(makeRequest({ projectId: 'p1', chapterId: 'ch1' }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toBe('j1')
    expect(body.status).toBe('QUEUED')
  })
})
