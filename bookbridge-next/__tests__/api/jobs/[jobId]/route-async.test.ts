/**
 * Failing (red) tests for issue #61 — GET /api/jobs/:id async status contract.
 *
 * The current GET /api/jobs/[jobId] proxies status to the Worker via
 * workerFetch and returns the Worker's response shape. Issue #61 requires the
 * route to read status directly from Postgres (written back by the Worker's
 * background task) and return:
 *   { id, status: 'PENDING'|'RUNNING'|'SUCCEEDED'|'FAILED',
 *     translatedContent?: string, error?: string }
 *
 * Key changes from the current implementation:
 * - Must return `translatedContent` (stored in `job.result` or a new
 *   `translatedContent` field) when status is SUCCEEDED.
 * - Must return new status vocabulary: PENDING / RUNNING / SUCCEEDED / FAILED
 *   (the current schema uses QUEUED / PROCESSING / COMPLETED / FAILED).
 * - Must NOT proxy to the Worker — all state is read from Postgres.
 * - Ownership check remains via job.project.ownerId === userId (403 on mismatch).
 *
 * These tests MUST fail until the implementation is updated.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Mock Clerk auth (OWASP A07)
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
// Mock global fetch — Worker must NOT be called by the new GET handler
// ---------------------------------------------------------------------------
const mockGlobalFetch = vi.fn()
vi.stubGlobal('fetch', mockGlobalFetch)

import { auth } from '@clerk/nextjs/server'

type AuthReturn = Awaited<ReturnType<typeof auth>>

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------
const OWNER_ID = 'user_owner_async'
const OTHER_USER_ID = 'user_intruder_async'
const JOB_ID = 'clh3p7b1p0010qzrmkf8g4m0x'
const TRANSLATED_TEXT = '我六岁的时候，在一本书中看到了一幅精彩的插画。'

function makeRequest(jobId: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/jobs/${jobId}`, { method: 'GET' })
}

function makeParams(jobId: string) {
  return { params: Promise.resolve({ jobId }) }
}

describe('GET /api/jobs/[jobId] — async status contract (issue #61)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  // -------------------------------------------------------------------------
  // Auth guard (OWASP A07)
  // -------------------------------------------------------------------------
  it('returns 401 when user is not authenticated', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: null } as AuthReturn)
    const { GET } = await import('@/app/api/jobs/[jobId]/route')
    const res = await GET(makeRequest(JOB_ID), makeParams(JOB_ID))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })

  // -------------------------------------------------------------------------
  // Happy path — PENDING status (no translatedContent yet)
  //
  // THE FAILING ASSERTION: current route would try to proxy to Worker for a
  // job with workerId=null and return `job_id` / `status: 'QUEUED'` (DB value).
  // After issue #61, it must return `id` + `status: 'PENDING'` (new vocabulary)
  // and never contact the Worker at all.
  // -------------------------------------------------------------------------
  it('returns 200 with { id, status: "PENDING" } and no translatedContent when job is pending', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: OWNER_ID } as AuthReturn)
    mockJobFindUnique.mockResolvedValueOnce({
      id: JOB_ID,
      status: 'PENDING',
      translatedContent: null,
      error: null,
      project: { ownerId: OWNER_ID },
    })

    const { GET } = await import('@/app/api/jobs/[jobId]/route')
    const res = await GET(makeRequest(JOB_ID), makeParams(JOB_ID))

    expect(res.status).toBe(200)
    const body = await res.json()

    // THE FAILING ASSERTIONS:
    // 1. Response must use `id` key (not `job_id` from Worker proxy shape)
    expect(body.id).toBe(JOB_ID)

    // 2. Status must be 'PENDING' (new vocabulary; current returns 'QUEUED')
    expect(body.status).toBe('PENDING')

    // 3. translatedContent must be absent or null when not yet ready
    expect(body.translatedContent ?? null).toBeNull()

    // 4. Worker must not have been called — all data from Postgres
    expect(mockGlobalFetch).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Happy path — SUCCEEDED status (translatedContent present)
  //
  // THE FAILING ASSERTION: current route uses `result` field (old schema) and
  // proxies to Worker. After issue #61, it must read `translatedContent` from
  // the DB row and return it in the response under the key `translatedContent`.
  // -------------------------------------------------------------------------
  it('returns 200 with translatedContent when job status is SUCCEEDED', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: OWNER_ID } as AuthReturn)
    mockJobFindUnique.mockResolvedValueOnce({
      id: JOB_ID,
      status: 'SUCCEEDED',
      translatedContent: TRANSLATED_TEXT,
      error: null,
      project: { ownerId: OWNER_ID },
    })

    const { GET } = await import('@/app/api/jobs/[jobId]/route')
    const res = await GET(makeRequest(JOB_ID), makeParams(JOB_ID))

    expect(res.status).toBe(200)
    const body = await res.json()

    // THE FAILING ASSERTIONS:
    // 1. Status must be 'SUCCEEDED' (not 'COMPLETED')
    expect(body.status).toBe('SUCCEEDED')

    // 2. translatedContent must be present and correct
    expect(body.translatedContent).toBe(TRANSLATED_TEXT)

    // 3. Worker must NOT be called
    expect(mockGlobalFetch).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Ownership check (OWASP A01 — IDOR)
  //
  // Returns 403 when the authenticated user is not the owner of the job's project.
  // This behavior must be preserved from the current implementation.
  // -------------------------------------------------------------------------
  it('returns 403 when authenticated user does not own the job\'s project', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: OTHER_USER_ID } as AuthReturn)
    mockJobFindUnique.mockResolvedValueOnce({
      id: JOB_ID,
      status: 'PENDING',
      translatedContent: null,
      error: null,
      project: { ownerId: OWNER_ID }, // owned by a different user
    })

    const { GET } = await import('@/app/api/jobs/[jobId]/route')
    const res = await GET(makeRequest(JOB_ID), makeParams(JOB_ID))

    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })

  // -------------------------------------------------------------------------
  // Edge case — job not found → 404
  // -------------------------------------------------------------------------
  it('returns 404 when job does not exist in the database', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: OWNER_ID } as AuthReturn)
    mockJobFindUnique.mockResolvedValueOnce(null)

    const { GET } = await import('@/app/api/jobs/[jobId]/route')
    const res = await GET(makeRequest(JOB_ID), makeParams(JOB_ID))

    expect(res.status).toBe(404)
  })

  // -------------------------------------------------------------------------
  // Edge case — FAILED status returns error field, no translatedContent
  // -------------------------------------------------------------------------
  it('returns 200 with error field and no translatedContent when job is FAILED', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: OWNER_ID } as AuthReturn)
    mockJobFindUnique.mockResolvedValueOnce({
      id: JOB_ID,
      status: 'FAILED',
      translatedContent: null,
      error: 'Translation failed',
      project: { ownerId: OWNER_ID },
    })

    const { GET } = await import('@/app/api/jobs/[jobId]/route')
    const res = await GET(makeRequest(JOB_ID), makeParams(JOB_ID))

    expect(res.status).toBe(200)
    const body = await res.json()

    // THE FAILING ASSERTION: current route may not expose the `error` field
    // from DB or may use a different response shape.
    expect(body.status).toBe('FAILED')
    expect(body.error).toBe('Translation failed')
    expect(body.translatedContent ?? null).toBeNull()
  })

  // -------------------------------------------------------------------------
  // Prisma select must include translatedContent field
  //
  // THE FAILING ASSERTION: current route selects { id, status, workerId,
  // project }. After issue #61, the select must also include translatedContent
  // and error so they can be returned to the poller.
  // -------------------------------------------------------------------------
  it('queries Prisma with a select that includes translatedContent and error fields', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: OWNER_ID } as AuthReturn)
    mockJobFindUnique.mockResolvedValueOnce({
      id: JOB_ID,
      status: 'PENDING',
      translatedContent: null,
      error: null,
      project: { ownerId: OWNER_ID },
    })

    const { GET } = await import('@/app/api/jobs/[jobId]/route')
    await GET(makeRequest(JOB_ID), makeParams(JOB_ID))

    // THE FAILING ASSERTION: select in Prisma call must include both fields
    expect(mockJobFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          translatedContent: true,
          error: true,
        }),
      })
    )
  })
})
