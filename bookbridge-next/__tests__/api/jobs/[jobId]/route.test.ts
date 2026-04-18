import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Mock Clerk auth
// ---------------------------------------------------------------------------
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkMiddleware: vi.fn(() => vi.fn()),
  createRouteMatcher: vi.fn(() => vi.fn()),
}))

// ---------------------------------------------------------------------------
// Mock Prisma singleton
// ---------------------------------------------------------------------------
const mockJobFindUnique = vi.fn()

vi.mock('@/lib/prisma', () => ({
  default: {
    translationJob: {
      findUnique: (...args: unknown[]) => mockJobFindUnique(...args),
    },
  },
}))

// ---------------------------------------------------------------------------
// Mock global fetch (used by workerFetch in lib/worker.ts)
// ---------------------------------------------------------------------------
const mockGlobalFetch = vi.fn()
vi.stubGlobal('fetch', mockGlobalFetch)

import { auth } from '@clerk/nextjs/server'

function makeRequest(jobId: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/jobs/${jobId}`, { method: 'GET' })
}

function makeParams(jobId: string) {
  return { params: Promise.resolve({ jobId }) }
}

const OWNER_ID = 'user_owner'
const OTHER_USER_ID = 'user_other'
const JOB_ID = 'clh3p7b1p0000qzrmkf8g4m0h'
const WORKER_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'

// Fixture matches exact Prisma select shape
const fakeJob = {
  id: JOB_ID,
  status: 'PROCESSING',
  workerId: WORKER_ID,
  project: { ownerId: OWNER_ID },
}

const fakeJobNoWorker = {
  id: JOB_ID,
  status: 'QUEUED',
  workerId: null,
  project: { ownerId: OWNER_ID },
}

const workerPayload = { job_id: WORKER_ID, status: 'processing', error: null }

describe('GET /api/jobs/[jobId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('returns 401 when user is not authenticated', async () => {
    vi.mocked(auth).mockResolvedValueOnce(
      { userId: null } as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
    )
    const { GET } = await import('@/app/api/jobs/[jobId]/route')
    const res = await GET(makeRequest(JOB_ID), makeParams(JOB_ID))
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBeDefined()
  })

  it('returns 404 when job does not exist in the database', async () => {
    vi.mocked(auth).mockResolvedValueOnce(
      { userId: OWNER_ID } as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
    )
    mockJobFindUnique.mockResolvedValueOnce(null)
    const { GET } = await import('@/app/api/jobs/[jobId]/route')
    const res = await GET(makeRequest(JOB_ID), makeParams(JOB_ID))
    expect(res.status).toBe(404)
    expect(mockJobFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: JOB_ID },
        select: expect.objectContaining({ project: expect.anything() }),
      }),
    )
  })

  it('returns 403 when the job belongs to a project owned by a different user', async () => {
    vi.mocked(auth).mockResolvedValueOnce(
      { userId: OTHER_USER_ID } as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
    )
    mockJobFindUnique.mockResolvedValueOnce(fakeJob)
    const { GET } = await import('@/app/api/jobs/[jobId]/route')
    const res = await GET(makeRequest(JOB_ID), makeParams(JOB_ID))
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBeDefined()
  })

  it('returns DB status when workerId is null (job not yet dispatched to Worker)', async () => {
    vi.mocked(auth).mockResolvedValueOnce(
      { userId: OWNER_ID } as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
    )
    mockJobFindUnique.mockResolvedValueOnce(fakeJobNoWorker)
    const { GET } = await import('@/app/api/jobs/[jobId]/route')
    const res = await GET(makeRequest(JOB_ID), makeParams(JOB_ID))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('QUEUED')
    expect(body.job_id).toBe(JOB_ID)
    expect(mockGlobalFetch).not.toHaveBeenCalled()
  })

  it('returns 200 with proxied Worker response using workerId (not Postgres ID)', async () => {
    vi.mocked(auth).mockResolvedValueOnce(
      { userId: OWNER_ID } as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
    )
    mockJobFindUnique.mockResolvedValueOnce(fakeJob)
    mockGlobalFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(workerPayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const { GET } = await import('@/app/api/jobs/[jobId]/route')
    const res = await GET(makeRequest(JOB_ID), makeParams(JOB_ID))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ status: 'processing', error: null })
    // Must use workerId (Worker UUID), not the Postgres CUID
    const fetchCall = mockGlobalFetch.mock.calls[0][0] as string
    expect(fetchCall).toContain(WORKER_ID)
    expect(fetchCall).not.toContain(JOB_ID)
    // Must set Cache-Control: no-store on polling endpoint
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('returns 502 with generic message when Worker is unreachable', async () => {
    vi.mocked(auth).mockResolvedValueOnce(
      { userId: OWNER_ID } as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
    )
    mockJobFindUnique.mockResolvedValueOnce(fakeJob)
    mockGlobalFetch.mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:8000'))
    const { GET } = await import('@/app/api/jobs/[jobId]/route')
    const res = await GET(makeRequest(JOB_ID), makeParams(JOB_ID))
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.error).toBeDefined()
    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED')
    expect(JSON.stringify(body)).not.toContain('stack')
  })
})
