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

function makeJobRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/jobs', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/jobs — TDD for issue #37', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGlobalFetch.mockResolvedValue(new Response('ok'))
  })

  it('rejects unauthenticated requests with 401', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: null } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
    const { POST } = await import('@/app/api/jobs/route')
    const res = await POST(makeJobRequest({ projectId: 'p1' }))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Unauthorized')
  })

  it('returns 400 when projectId is missing', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: 'u1' } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
    const { POST } = await import('@/app/api/jobs/route')
    const res = await POST(makeJobRequest({}))
    expect(res.status).toBe(400)
  })

  it('returns 404 for nonexistent project', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: 'u1' } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
    mockProjectFindUnique.mockResolvedValueOnce(null)
    const { POST } = await import('@/app/api/jobs/route')
    const res = await POST(makeJobRequest({ projectId: 'nope' }))
    expect(res.status).toBe(404)
  })

  it('returns 403 when user is not the project owner', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: 'u1' } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
    mockProjectFindUnique.mockResolvedValueOnce({ id: 'p1', ownerId: 'other' })
    const { POST } = await import('@/app/api/jobs/route')
    const res = await POST(makeJobRequest({ projectId: 'p1' }))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('Forbidden')
  })

  it('creates a queued job and returns 201', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: 'u1' } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
    mockProjectFindUnique.mockResolvedValueOnce({ id: 'p1', ownerId: 'u1' })
    mockJobCreate.mockResolvedValueOnce({ id: 'job-1', status: 'QUEUED' })
    const { POST } = await import('@/app/api/jobs/route')
    const res = await POST(makeJobRequest({ projectId: 'p1', chapterId: 'ch-1' }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toBe('job-1')
    expect(body.status).toBe('QUEUED')
  })

  it('proxies to worker /translate/chunk endpoint', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: 'u1' } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
    mockProjectFindUnique.mockResolvedValueOnce({ id: 'p1', ownerId: 'u1' })
    mockJobCreate.mockResolvedValueOnce({ id: 'job-2', status: 'QUEUED' })
    const { POST } = await import('@/app/api/jobs/route')
    await POST(makeJobRequest({ projectId: 'p1', chapterId: 'ch-2' }))
    expect(mockGlobalFetch).toHaveBeenCalledWith(
      expect.stringContaining('/translate/chunk'),
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('still succeeds when worker is unreachable', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: 'u1' } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
    mockProjectFindUnique.mockResolvedValueOnce({ id: 'p1', ownerId: 'u1' })
    mockJobCreate.mockResolvedValueOnce({ id: 'job-3', status: 'QUEUED' })
    mockGlobalFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'))
    const { POST } = await import('@/app/api/jobs/route')
    const res = await POST(makeJobRequest({ projectId: 'p1' }))
    expect(res.status).toBe(201)
  })
})
