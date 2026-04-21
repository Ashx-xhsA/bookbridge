/**
 * Failing (red) tests for issue #61 — POST /api/jobs async conversion.
 *
 * The current POST /api/jobs is synchronous: it awaits Worker /translate/chunk
 * and returns 200 + COMPLETED only after the translation finishes. Issue #61
 * requires it to return 202 + { id, status: 'PENDING' } immediately, without
 * waiting on the Worker at all. The Worker is called in a background task and
 * writes the result back to Postgres. The BFF never blocks on it.
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
// Mock next/server `after()` to execute its callback synchronously.
//
// In production `after()` runs its task in the request's post-response
// lifecycle (managed by Vercel's runtime). In Vitest we invoke the route
// handler directly with no such context, so without this shim the Worker
// dispatch callback would never run and the assertions below would fail.
// ---------------------------------------------------------------------------
vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server')
  return {
    ...actual,
    after: (fn: () => void | Promise<void>) => {
      void fn()
    },
  }
})

// ---------------------------------------------------------------------------
// Mock Prisma singleton
// ---------------------------------------------------------------------------
const mockJobCreate = vi.fn()
const mockJobUpdate = vi.fn()
const mockJobFindFirst = vi.fn()
const mockProjectFindUnique = vi.fn()
const mockChapterFindUnique = vi.fn()
const mockChapterUpdate = vi.fn()
const mockTransaction = vi.fn()

vi.mock('@/lib/prisma', () => ({
  default: {
    translationJob: {
      create: (...args: unknown[]) => mockJobCreate(...args),
      update: (...args: unknown[]) => mockJobUpdate(...args),
      findFirst: (...args: unknown[]) => mockJobFindFirst(...args),
    },
    project: {
      findUnique: (...args: unknown[]) => mockProjectFindUnique(...args),
    },
    chapter: {
      findUnique: (...args: unknown[]) => mockChapterFindUnique(...args),
      update: (...args: unknown[]) => mockChapterUpdate(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}))

// ---------------------------------------------------------------------------
// Mock global fetch (used by workerFetch in lib/worker.ts)
// ---------------------------------------------------------------------------
const mockGlobalFetch = vi.fn()
vi.stubGlobal('fetch', mockGlobalFetch)

import { auth } from '@clerk/nextjs/server'

type AuthReturn = Awaited<ReturnType<typeof auth>>

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------
const PROJECT_ID = 'clh3p7b1p0001qzrmkf8g4m0i'
const CHAPTER_ID = 'clh3p7b1p0002qzrmkf8g4m0j'
const JOB_ID = 'clh3p7b1p0003qzrmkf8g4m0k'
const USER_ID = 'user_async_test'
const SOURCE_TEXT = 'Der Hund biss den Mann.'
const TARGET_LANG = 'zh-Hans'

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/jobs', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/jobs — async conversion (issue #61)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mockJobFindFirst.mockReset()
    // Default: no existing active job (idempotency check passes through)
    mockJobFindFirst.mockResolvedValue(null)
  })

  // -------------------------------------------------------------------------
  // Auth guard (OWASP A07)
  // -------------------------------------------------------------------------
  it('returns 401 when user is not authenticated', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: null } as AuthReturn)
    const { POST } = await import('@/app/api/jobs/route')
    const res = await POST(makeRequest({ projectId: PROJECT_ID, chapterId: CHAPTER_ID }))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })

  // -------------------------------------------------------------------------
  // Input validation (OWASP A03)
  // -------------------------------------------------------------------------
  it('returns 400 when projectId is missing', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: USER_ID } as AuthReturn)
    const { POST } = await import('@/app/api/jobs/route')
    const res = await POST(makeRequest({ chapterId: CHAPTER_ID }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when chapterId is missing', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: USER_ID } as AuthReturn)
    const { POST } = await import('@/app/api/jobs/route')
    const res = await POST(makeRequest({ projectId: PROJECT_ID }))
    expect(res.status).toBe(400)
  })

  // -------------------------------------------------------------------------
  // Happy path — async: must return 202 + PENDING without awaiting Worker
  //
  // THE CORE FAILING ASSERTION: current route awaits Worker and returns 200
  // + COMPLETED. After issue #61, it must return 202 + PENDING immediately.
  // -------------------------------------------------------------------------
  it('returns 202 with { id, status: "PENDING" } without awaiting the Worker', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: USER_ID } as AuthReturn)
    mockProjectFindUnique.mockResolvedValueOnce({
      id: PROJECT_ID,
      ownerId: USER_ID,
      targetLang: TARGET_LANG,
    })
    mockChapterFindUnique.mockResolvedValueOnce({
      id: CHAPTER_ID,
      sourceContent: SOURCE_TEXT,
      projectId: PROJECT_ID,
    })
    mockJobCreate.mockResolvedValueOnce({ id: JOB_ID, status: 'PENDING' })

    // Worker fetch hangs for 30 000 ms — if the route awaits it the test
    // will time out (Vitest default: 5 000 ms). The only way to return fast
    // is to NOT await the Worker call.
    mockGlobalFetch.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 30_000))
    )

    const start = Date.now()
    const { POST } = await import('@/app/api/jobs/route')
    const res = await POST(makeRequest({ projectId: PROJECT_ID, chapterId: CHAPTER_ID }))
    const elapsed = Date.now() - start

    // THE FAILING ASSERTIONS:
    // 1. Must return 202, not 200 or 201
    expect(res.status).toBe(202)

    // 2. Response body must be { id, status: 'PENDING' }
    const body = await res.json()
    expect(body.id).toBe(JOB_ID)
    expect(body.status).toBe('PENDING')

    // 3. Route must respond well under 1 second even though Worker is "slow"
    expect(elapsed).toBeLessThan(1000)
  })

  // -------------------------------------------------------------------------
  // Async: Worker must NOT block the response (fire-and-forget pattern)
  //
  // The Worker call to /translate/chunk/async must be dispatched but must
  // not be awaited before returning the 202 response.
  // -------------------------------------------------------------------------
  it('calls Worker /translate/chunk/async (not /translate/chunk) for the background task', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: USER_ID } as AuthReturn)
    mockProjectFindUnique.mockResolvedValueOnce({
      id: PROJECT_ID,
      ownerId: USER_ID,
      targetLang: TARGET_LANG,
    })
    mockChapterFindUnique.mockResolvedValueOnce({
      id: CHAPTER_ID,
      sourceContent: SOURCE_TEXT,
      projectId: PROJECT_ID,
    })
    mockJobCreate.mockResolvedValueOnce({ id: JOB_ID, status: 'PENDING' })

    // Worker returns 202 immediately (async endpoint)
    mockGlobalFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ job_id: 'worker-uuid-123' }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const { POST } = await import('@/app/api/jobs/route')
    const res = await POST(makeRequest({ projectId: PROJECT_ID, chapterId: CHAPTER_ID }))

    expect(res.status).toBe(202)

    // THE FAILING ASSERTION: current route calls /translate/chunk (sync).
    // After issue #61, it must call /translate/chunk/async (new Worker endpoint).
    const fetchedUrl = mockGlobalFetch.mock.calls[0]?.[0] as string | undefined
    expect(fetchedUrl).toBeDefined()
    expect(fetchedUrl).toContain('/translate/chunk/async')
  })

  // -------------------------------------------------------------------------
  // Job created with PENDING status (new status value required by issue #61)
  //
  // THE FAILING ASSERTION: current route creates jobs with status 'QUEUED'.
  // After issue #61, it must create them with status 'PENDING'.
  // -------------------------------------------------------------------------
  it('creates the TranslationJob row with status PENDING (not QUEUED)', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: USER_ID } as AuthReturn)
    mockProjectFindUnique.mockResolvedValueOnce({
      id: PROJECT_ID,
      ownerId: USER_ID,
      targetLang: TARGET_LANG,
    })
    mockChapterFindUnique.mockResolvedValueOnce({
      id: CHAPTER_ID,
      sourceContent: SOURCE_TEXT,
      projectId: PROJECT_ID,
    })
    mockJobCreate.mockResolvedValueOnce({ id: JOB_ID, status: 'PENDING' })
    mockGlobalFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ job_id: 'worker-uuid-123' }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const { POST } = await import('@/app/api/jobs/route')
    await POST(makeRequest({ projectId: PROJECT_ID, chapterId: CHAPTER_ID }))

    // THE FAILING ASSERTION: prisma.translationJob.create must be called with
    // status: 'PENDING' (not 'QUEUED') to match the new async status contract.
    expect(mockJobCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PENDING' }),
      })
    )
  })

  // -------------------------------------------------------------------------
  // Ownership check (OWASP A01 — IDOR)
  // -------------------------------------------------------------------------
  it('returns 403 when authenticated user does not own the project', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: 'user_intruder' } as AuthReturn)
    mockProjectFindUnique.mockResolvedValueOnce({
      id: PROJECT_ID,
      ownerId: USER_ID, // owned by a different user
      targetLang: TARGET_LANG,
    })

    const { POST } = await import('@/app/api/jobs/route')
    const res = await POST(makeRequest({ projectId: PROJECT_ID, chapterId: CHAPTER_ID }))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })

  // -------------------------------------------------------------------------
  // Edge case: referenced project does not exist → 404
  // -------------------------------------------------------------------------
  it('returns 404 when the referenced project does not exist', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: USER_ID } as AuthReturn)
    mockProjectFindUnique.mockResolvedValueOnce(null)

    const { POST } = await import('@/app/api/jobs/route')
    const res = await POST(makeRequest({ projectId: PROJECT_ID, chapterId: CHAPTER_ID }))
    expect(res.status).toBe(404)
  })
})
