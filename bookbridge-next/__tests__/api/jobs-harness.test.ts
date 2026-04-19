/**
 * Failing (red) tests for issue #51 — surface 2:
 * POST /api/jobs harness integration.
 *
 * The current route dispatches to worker /translate/chunk with {project_id,
 * chunk_id} and stores the returned workerId asynchronously.  Issue #51
 * requires a synchronous harness loop:
 *   1. Reads chapter.sourceContent from DB
 *   2. POSTs {source_text, target_lang} to worker /translate/chunk
 *   3. Writes returned translation to chapter.translation
 *   4. Transitions job QUEUED → COMPLETED in a transaction
 *   5. Returns {id, status} only — no source/translation text leaked
 *   6. On empty sourceContent → job FAILED, 4xx returned
 *   7. On worker 5xx → job FAILED, client 502
 *   8. All chapter + job writes wrapped in prisma.$transaction
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkMiddleware: vi.fn(() => vi.fn()),
  createRouteMatcher: vi.fn(() => vi.fn()),
}))

const mockJobCreate = vi.fn()
const mockJobUpdate = vi.fn()
const mockJobFindUnique = vi.fn()
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
      findUnique: (...args: unknown[]) => mockJobFindUnique(...args),
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

const mockGlobalFetch = vi.fn()
vi.stubGlobal('fetch', mockGlobalFetch)

import { auth } from '@clerk/nextjs/server'

type AuthReturn = Awaited<ReturnType<typeof auth>>

const PROJECT_ID = 'clh3p7b1p0001qzrmkf8g4m0i'
const CHAPTER_ID = 'clh3p7b1p0002qzrmkf8g4m0j'
const JOB_ID = 'clh3p7b1p0003qzrmkf8g4m0k'
const USER_ID = 'user_abc'
const SOURCE_TEXT = 'Once when I was six years old I saw a magnificent picture in a book.'
const TRANSLATED_TEXT = '我六岁的时候，在一本书中看到了一幅精彩的插画。'
const TARGET_LANG = 'zh-Hans'

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/jobs', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/jobs — harness integration (issue #51)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    // Drain any leftover mockResolvedValueOnce entries from previous tests —
    // vi.clearAllMocks() doesn't clear the Once queue.
    mockJobFindFirst.mockReset()
    // Default: no existing active job (idempotency check falls through)
    mockJobFindFirst.mockResolvedValue(null)
    // Default: transaction executes the callback with a fake tx client
    mockTransaction.mockImplementation(async (fn: unknown) =>
      typeof fn === 'function'
        ? fn({ chapter: { update: mockChapterUpdate }, translationJob: { update: mockJobUpdate } })
        : fn,
    )
  })

  // -------------------------------------------------------------------------
  // Auth guard (OWASP A07)
  // -------------------------------------------------------------------------
  it('returns 401 when user is not authenticated', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: null } as AuthReturn)
    const { POST } = await import('@/app/api/jobs/route')
    const res = await POST(makeRequest({ projectId: PROJECT_ID, chapterId: CHAPTER_ID }))
    expect(res.status).toBe(401)
  })

  // -------------------------------------------------------------------------
  // Input validation (OWASP A03)
  // -------------------------------------------------------------------------
  it('returns 400 when chapterId is missing from a harness translation request', async () => {
    // A synchronous translation job REQUIRES a chapterId to look up sourceContent.
    vi.mocked(auth).mockResolvedValueOnce({ userId: USER_ID } as AuthReturn)
    mockProjectFindUnique.mockResolvedValueOnce({ id: PROJECT_ID, ownerId: USER_ID, targetLang: TARGET_LANG })
    mockJobCreate.mockResolvedValueOnce({ id: JOB_ID, status: 'QUEUED' })
    const { POST } = await import('@/app/api/jobs/route')
    // Submit without chapterId — the route must reject this for harness mode
    const res = await POST(makeRequest({ projectId: PROJECT_ID }))
    // chapterId is required by the Zod schema (z.string().cuid()); missing
    // field must surface as 400 Invalid request body, not any other code.
    expect(res.status).toBe(400)
  })

  // -------------------------------------------------------------------------
  // Happy path — synchronous translation loop
  // -------------------------------------------------------------------------
  it('reads sourceContent, posts to worker /translate/chunk, and returns COMPLETED job', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: USER_ID } as AuthReturn)
    mockProjectFindUnique.mockResolvedValueOnce({ id: PROJECT_ID, ownerId: USER_ID, targetLang: TARGET_LANG })
    mockChapterFindUnique.mockResolvedValueOnce({ id: CHAPTER_ID, sourceContent: SOURCE_TEXT, projectId: PROJECT_ID })
    mockJobCreate.mockResolvedValueOnce({ id: JOB_ID, status: 'QUEUED' })
    mockGlobalFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ translation: TRANSLATED_TEXT }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )
    mockTransaction.mockResolvedValueOnce({ id: JOB_ID, status: 'COMPLETED' })

    const { POST } = await import('@/app/api/jobs/route')
    const res = await POST(makeRequest({ projectId: PROJECT_ID, chapterId: CHAPTER_ID }))

    // THE FAILING ASSERTIONS:
    // 1. Worker must be called with source_text and target_lang, not project_id/chunk_id
    expect(mockGlobalFetch).toHaveBeenCalledWith(
      expect.stringContaining('/translate/chunk'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"source_text"'),
      })
    )
    const fetchBody = JSON.parse(mockGlobalFetch.mock.calls[0][1].body as string)
    expect(fetchBody.source_text).toBe(SOURCE_TEXT)
    expect(fetchBody.target_lang).toBe(TARGET_LANG)

    // 2. Response must be 200 (synchronous completion, not 201 QUEUED)
    expect(res.status).toBe(200)

    // 3. Response body must contain {id, status} with status COMPLETED
    const body = await res.json()
    expect(body.id).toBe(JOB_ID)
    expect(body.status).toBe('COMPLETED')
  })

  // -------------------------------------------------------------------------
  // Data exposure guard (OWASP A09 / issue #51 explicit requirement)
  // Harness completion must return HTTP 200 with {id, status: "COMPLETED"},
  // not HTTP 201 with {id, status: "QUEUED"}.
  // -------------------------------------------------------------------------
  it('returns HTTP 200 (not 201) with status COMPLETED after synchronous translation', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: USER_ID } as AuthReturn)
    mockProjectFindUnique.mockResolvedValueOnce({ id: PROJECT_ID, ownerId: USER_ID, targetLang: TARGET_LANG })
    mockChapterFindUnique.mockResolvedValueOnce({ id: CHAPTER_ID, sourceContent: SOURCE_TEXT, projectId: PROJECT_ID })
    mockJobCreate.mockResolvedValueOnce({ id: JOB_ID, status: 'QUEUED' })
    mockGlobalFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ translation: TRANSLATED_TEXT }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )
    mockTransaction.mockResolvedValueOnce({ id: JOB_ID, status: 'COMPLETED' })

    const { POST } = await import('@/app/api/jobs/route')
    const res = await POST(makeRequest({ projectId: PROJECT_ID, chapterId: CHAPTER_ID }))

    // THE FAILING ASSERTION: current route returns 201 (job queued, not completed).
    // Harness integration must execute synchronously and return 200 + COMPLETED.
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('COMPLETED')
  })

  // -------------------------------------------------------------------------
  // Edge case: empty sourceContent → job FAILED, 4xx returned (not 200 silent)
  // -------------------------------------------------------------------------
  it('returns 4xx and marks job FAILED when sourceContent is empty', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: USER_ID } as AuthReturn)
    mockProjectFindUnique.mockResolvedValueOnce({ id: PROJECT_ID, ownerId: USER_ID, targetLang: TARGET_LANG })
    mockChapterFindUnique.mockResolvedValueOnce({ id: CHAPTER_ID, sourceContent: '', projectId: PROJECT_ID })
    mockJobCreate.mockResolvedValueOnce({ id: JOB_ID, status: 'QUEUED' })

    const { POST } = await import('@/app/api/jobs/route')
    const res = await POST(makeRequest({ projectId: PROJECT_ID, chapterId: CHAPTER_ID }))

    // THE FAILING ASSERTION: current route would try to translate empty string.
    // Issue #51 requires: empty sourceContent → job FAILED + 4xx, not 200.
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)

    // Worker must NOT have been called (don't send empty strings to AI)
    expect(mockGlobalFetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/translate/chunk'),
      expect.anything()
    )
  })

  it('includes "No source content" in error message for empty sourceContent', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: USER_ID } as AuthReturn)
    mockProjectFindUnique.mockResolvedValueOnce({ id: PROJECT_ID, ownerId: USER_ID, targetLang: TARGET_LANG })
    mockChapterFindUnique.mockResolvedValueOnce({ id: CHAPTER_ID, sourceContent: null, projectId: PROJECT_ID })
    mockJobCreate.mockResolvedValueOnce({ id: JOB_ID, status: 'QUEUED' })

    const { POST } = await import('@/app/api/jobs/route')
    const res = await POST(makeRequest({ projectId: PROJECT_ID, chapterId: CHAPTER_ID }))

    const body = await res.json()
    // THE FAILING ASSERTION: issue #51 spec: error must say "No source content to translate"
    expect(body.error).toMatch(/no source content/i)
  })

  // -------------------------------------------------------------------------
  // Edge case: worker 5xx → job FAILED, client 502
  // -------------------------------------------------------------------------
  it('returns 502 and marks job FAILED when worker returns 5xx', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: USER_ID } as AuthReturn)
    mockProjectFindUnique.mockResolvedValueOnce({ id: PROJECT_ID, ownerId: USER_ID, targetLang: TARGET_LANG })
    mockChapterFindUnique.mockResolvedValueOnce({ id: CHAPTER_ID, sourceContent: SOURCE_TEXT, projectId: PROJECT_ID })
    mockJobCreate.mockResolvedValueOnce({ id: JOB_ID, status: 'QUEUED' })
    mockGlobalFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const { POST } = await import('@/app/api/jobs/route')
    const res = await POST(makeRequest({ projectId: PROJECT_ID, chapterId: CHAPTER_ID }))

    // THE FAILING ASSERTION: current route ignores worker errors and returns 201.
    // Issue #51 requires: worker 5xx → job FAILED + 502 to client.
    expect(res.status).toBe(502)
  })

  // -------------------------------------------------------------------------
  // Transaction wrapping (no partial writes)
  // -------------------------------------------------------------------------
  it('wraps chapter.translation update and job status update in a prisma.$transaction', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: USER_ID } as AuthReturn)
    mockProjectFindUnique.mockResolvedValueOnce({ id: PROJECT_ID, ownerId: USER_ID, targetLang: TARGET_LANG })
    mockChapterFindUnique.mockResolvedValueOnce({ id: CHAPTER_ID, sourceContent: SOURCE_TEXT, projectId: PROJECT_ID })
    mockJobCreate.mockResolvedValueOnce({ id: JOB_ID, status: 'QUEUED' })
    mockGlobalFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ translation: TRANSLATED_TEXT }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )
    mockTransaction.mockResolvedValueOnce({ id: JOB_ID, status: 'COMPLETED' })

    const { POST } = await import('@/app/api/jobs/route')
    await POST(makeRequest({ projectId: PROJECT_ID, chapterId: CHAPTER_ID }))

    // THE FAILING ASSERTION: current route does not use $transaction for
    // the harness result writes. It must wrap both updates atomically.
    expect(mockTransaction).toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Idempotency — double-submit must not create duplicate QUEUED rows
  // (C.L.E.A.R. review MUST FIX #2)
  // -------------------------------------------------------------------------
  it('returns 409 and does not call worker when an active job already exists for the chapter', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: USER_ID } as AuthReturn)
    mockProjectFindUnique.mockResolvedValueOnce({ id: PROJECT_ID, ownerId: USER_ID, targetLang: TARGET_LANG })
    mockChapterFindUnique.mockResolvedValueOnce({ id: CHAPTER_ID, sourceContent: SOURCE_TEXT, projectId: PROJECT_ID })
    const existingJobId = 'clh3p7b1p0099qzrmkf8g4m0z'
    mockJobFindFirst.mockResolvedValueOnce({ id: existingJobId, status: 'QUEUED' })

    const { POST } = await import('@/app/api/jobs/route')
    const res = await POST(makeRequest({ projectId: PROJECT_ID, chapterId: CHAPTER_ID }))

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.id).toBe(existingJobId)
    expect(body.status).toBe('QUEUED')
    // Must NOT create a second row or contact the worker
    expect(mockJobCreate).not.toHaveBeenCalled()
    expect(mockGlobalFetch).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Whitespace guard (C.L.E.A.R. review SHOULD CONSIDER #1)
  // -------------------------------------------------------------------------
  it('rejects whitespace-only sourceContent as empty (does not send to worker)', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: USER_ID } as AuthReturn)
    mockProjectFindUnique.mockResolvedValueOnce({ id: PROJECT_ID, ownerId: USER_ID, targetLang: TARGET_LANG })
    mockChapterFindUnique.mockResolvedValueOnce({ id: CHAPTER_ID, sourceContent: '   \n\n   ', projectId: PROJECT_ID })
    mockJobCreate.mockResolvedValueOnce({ id: JOB_ID, status: 'QUEUED' })

    const { POST } = await import('@/app/api/jobs/route')
    const res = await POST(makeRequest({ projectId: PROJECT_ID, chapterId: CHAPTER_ID }))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/no source content/i)
    expect(mockGlobalFetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/translate/chunk'),
      expect.anything(),
    )
  })
})
