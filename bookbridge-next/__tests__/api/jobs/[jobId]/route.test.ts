import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Mock Clerk auth — must be hoisted before any import of @clerk/nextjs/server
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
// Mock global fetch (used by workerFetch helper in lib/worker.ts)
// ---------------------------------------------------------------------------
const mockGlobalFetch = vi.fn()
vi.stubGlobal('fetch', mockGlobalFetch)

// ---------------------------------------------------------------------------
// Import auth after mocks are registered
// ---------------------------------------------------------------------------
import { auth } from '@clerk/nextjs/server'

// ---------------------------------------------------------------------------
// Helper — build a NextRequest for GET /api/jobs/[jobId]
// ---------------------------------------------------------------------------
function makeRequest(jobId: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/jobs/${jobId}`, {
    method: 'GET',
  })
}

// ---------------------------------------------------------------------------
// Reusable route params object (Next.js App Router passes params as a Promise)
// ---------------------------------------------------------------------------
function makeParams(jobId: string) {
  return { params: Promise.resolve({ jobId }) }
}

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------
const OWNER_ID = 'user_owner'
const OTHER_USER_ID = 'user_other'
const JOB_ID = 'clh3p7b1p0000qzrmkf8g4m0h'

const fakeJob = {
  id: JOB_ID,
  projectId: 'proj_1',
  chapterId: 'ch_1',
  status: 'PROCESSING',
  workerId: 'wid_1',
  result: null,
  error: null,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-01-01T00:01:00Z'),
  project: {
    id: 'proj_1',
    ownerId: OWNER_ID,
  },
}

const workerPayload = {
  job_id: JOB_ID,
  status: 'processing',
  progress: 42,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('GET /api/jobs/[jobId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // -------------------------------------------------------------------------
  // 1. Auth guard — A07 / OWASP
  // -------------------------------------------------------------------------
  it('returns 401 when user is not authenticated', async () => {
    vi.mocked(auth).mockResolvedValueOnce(
      { userId: null } as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
    )

    const { GET } = await import('@/app/api/jobs/[jobId]/route')
    const res = await GET(makeRequest(JOB_ID), makeParams(JOB_ID))

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })

  // -------------------------------------------------------------------------
  // 2. Not found — job missing from DB
  // -------------------------------------------------------------------------
  it('returns 404 when job does not exist in the database', async () => {
    vi.mocked(auth).mockResolvedValueOnce(
      { userId: OWNER_ID } as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
    )
    mockJobFindUnique.mockResolvedValueOnce(null)

    const { GET } = await import('@/app/api/jobs/[jobId]/route')
    const res = await GET(makeRequest(JOB_ID), makeParams(JOB_ID))

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBeDefined()
    expect(mockJobFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: JOB_ID },
        select: expect.objectContaining({ project: expect.anything() }),
      }),
    )
  })

  // -------------------------------------------------------------------------
  // 3. Ownership check — A01 / IDOR prevention
  // -------------------------------------------------------------------------
  it('returns 403 when the job belongs to a project owned by a different user', async () => {
    vi.mocked(auth).mockResolvedValueOnce(
      { userId: OTHER_USER_ID } as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
    )
    mockJobFindUnique.mockResolvedValueOnce(fakeJob)

    const { GET } = await import('@/app/api/jobs/[jobId]/route')
    const res = await GET(makeRequest(JOB_ID), makeParams(JOB_ID))

    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })

  // -------------------------------------------------------------------------
  // 4. Happy path — authenticated owner, Worker returns status payload
  // -------------------------------------------------------------------------
  it('returns 200 with the proxied Worker response body on happy path', async () => {
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
    // The BFF must forward whatever the Worker returns
    expect(body).toMatchObject({
      job_id: JOB_ID,
      status: 'processing',
      progress: 42,
    })
  })

  // -------------------------------------------------------------------------
  // 5. Edge case — Worker unreachable → 502, no stack trace in response
  // -------------------------------------------------------------------------
  it('returns 502 with a generic message and no stack trace when Worker is unreachable', async () => {
    vi.mocked(auth).mockResolvedValueOnce(
      { userId: OWNER_ID } as ReturnType<typeof auth> extends Promise<infer T> ? T : never,
    )
    mockJobFindUnique.mockResolvedValueOnce(fakeJob)
    // Simulate network failure — fetch throws
    mockGlobalFetch.mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:8000'))

    const { GET } = await import('@/app/api/jobs/[jobId]/route')
    const res = await GET(makeRequest(JOB_ID), makeParams(JOB_ID))

    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.error).toBeDefined()
    // Must NOT leak internal error details or stack traces to the client
    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED')
    expect(JSON.stringify(body)).not.toContain('stack')
  })
})
