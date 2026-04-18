import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkMiddleware: vi.fn(() => vi.fn()),
  createRouteMatcher: vi.fn(() => vi.fn()),
}))

const mockJobCreate = vi.fn()
const mockJobUpdate = vi.fn()
const mockProjectFindUnique = vi.fn()
const mockGlobalFetch = vi.fn()

vi.mock('@/lib/prisma', () => ({
  default: {
    translationJob: {
      create: (...args: unknown[]) => mockJobCreate(...args),
      update: (...args: unknown[]) => mockJobUpdate(...args),
    },
    project: {
      findUnique: (...args: unknown[]) => mockProjectFindUnique(...args),
    },
  },
}))

vi.stubGlobal('fetch', mockGlobalFetch)

import { auth } from '@clerk/nextjs/server'

const PROJECT_ID = 'clh3p7b1p0001qzrmkf8g4m0i'
const CHAPTER_ID = 'clh3p7b1p0002qzrmkf8g4m0j'
const JOB_DB_ID = 'clh3p7b1p0003qzrmkf8g4m0k'
const WORKER_JOB_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
const USER_ID = 'u1'

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
    const res = await POST(makeJobRequest({ projectId: PROJECT_ID }))
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('Unauthorized')
  })

  it('returns 400 when projectId is missing', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: USER_ID } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
    const { POST } = await import('@/app/api/jobs/route')
    const res = await POST(makeJobRequest({}))
    expect(res.status).toBe(400)
  })

  it('returns 404 for nonexistent project', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: USER_ID } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
    mockProjectFindUnique.mockResolvedValueOnce(null)
    const { POST } = await import('@/app/api/jobs/route')
    const res = await POST(makeJobRequest({ projectId: PROJECT_ID }))
    expect(res.status).toBe(404)
  })

  it('returns 403 when user is not the project owner', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: USER_ID } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
    mockProjectFindUnique.mockResolvedValueOnce({ id: PROJECT_ID, ownerId: 'other' })
    const { POST } = await import('@/app/api/jobs/route')
    const res = await POST(makeJobRequest({ projectId: PROJECT_ID }))
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('Forbidden')
  })

  it('creates a queued job and returns 201', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: USER_ID } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
    mockProjectFindUnique.mockResolvedValueOnce({ id: PROJECT_ID, ownerId: USER_ID })
    mockJobCreate.mockResolvedValueOnce({ id: JOB_DB_ID, status: 'QUEUED' })
    const { POST } = await import('@/app/api/jobs/route')
    const res = await POST(makeJobRequest({ projectId: PROJECT_ID, chapterId: CHAPTER_ID }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toBe(JOB_DB_ID)
    expect(body.status).toBe('QUEUED')
  })

  it('proxies to Worker /translate/chunk and stores workerId when Worker returns job_id', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: USER_ID } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
    mockProjectFindUnique.mockResolvedValueOnce({ id: PROJECT_ID, ownerId: USER_ID })
    mockJobCreate.mockResolvedValueOnce({ id: JOB_DB_ID, status: 'QUEUED' })
    mockGlobalFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ job_id: WORKER_JOB_ID, status: 'queued' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    mockJobUpdate.mockResolvedValueOnce({ id: JOB_DB_ID, workerId: WORKER_JOB_ID })
    const { POST } = await import('@/app/api/jobs/route')
    await POST(makeJobRequest({ projectId: PROJECT_ID, chapterId: CHAPTER_ID }))
    expect(mockGlobalFetch).toHaveBeenCalledWith(
      expect.stringContaining('/translate/chunk'),
      expect.objectContaining({ method: 'POST' })
    )
    expect(mockJobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { workerId: WORKER_JOB_ID } })
    )
  })

  it('still succeeds when Worker is unreachable (workerId stays null)', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: USER_ID } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
    mockProjectFindUnique.mockResolvedValueOnce({ id: PROJECT_ID, ownerId: USER_ID })
    mockJobCreate.mockResolvedValueOnce({ id: JOB_DB_ID, status: 'QUEUED' })
    mockGlobalFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'))
    const { POST } = await import('@/app/api/jobs/route')
    const res = await POST(makeJobRequest({ projectId: PROJECT_ID }))
    expect(res.status).toBe(201)
    expect(mockJobUpdate).not.toHaveBeenCalled()
  })
})
