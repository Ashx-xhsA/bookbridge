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
import { encryptApiKey } from '@/lib/api-key-crypto'

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
const mockChapterFindMany = vi.fn()
const mockChapterUpdate = vi.fn()
const mockUserFindUnique = vi.fn()
const mockUserUpdate = vi.fn()
const mockGlossaryTermFindMany = vi.fn()
const mockSegmentFindMany = vi.fn()
const mockBibleFindUnique = vi.fn()
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
      findMany: (...args: unknown[]) => mockChapterFindMany(...args),
      update: (...args: unknown[]) => mockChapterUpdate(...args),
    },
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      update: (...args: unknown[]) => mockUserUpdate(...args),
    },
    glossaryTerm: {
      findMany: (...args: unknown[]) => mockGlossaryTermFindMany(...args),
    },
    segment: {
      findMany: (...args: unknown[]) => mockSegmentFindMany(...args),
    },
    bookBible: {
      findUnique: (...args: unknown[]) => mockBibleFindUnique(...args),
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
    mockJobFindFirst.mockResolvedValue(null)
    // Defaults so existing tests don't need to re-mock every time:
    // - User has API key (skips free-tier gate)
    // - No adjacent chapters with summaries (no context injection)
    // - Empty glossary (omits glossary from worker body)
    mockUserFindUnique.mockResolvedValue({ apiKey: encryptApiKey('sk-test', USER_ID), freeCharsUsed: 0 })
    mockChapterFindMany.mockResolvedValue([])
    mockGlossaryTermFindMany.mockResolvedValue([])
    mockSegmentFindMany.mockResolvedValue([])
    mockBibleFindUnique.mockResolvedValue(null)
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
      segments: [{ index: 0, source: SOURCE_TEXT }],
      projectId: PROJECT_ID,
      number: 1,
    })
    mockJobCreate.mockResolvedValueOnce({ id: JOB_ID, status: 'PENDING' })

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
  it('calls Worker /translate/segments/async for the background task', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: USER_ID } as AuthReturn)
    mockProjectFindUnique.mockResolvedValueOnce({
      id: PROJECT_ID,
      ownerId: USER_ID,
      targetLang: TARGET_LANG,
    })
    mockChapterFindUnique.mockResolvedValueOnce({
      id: CHAPTER_ID,
      segments: [{ index: 0, source: SOURCE_TEXT }],
      projectId: PROJECT_ID,
      number: 1,
    })
    mockJobCreate.mockResolvedValueOnce({ id: JOB_ID, status: 'PENDING' })

    mockGlobalFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ job_id: 'worker-uuid-123' }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const { POST } = await import('@/app/api/jobs/route')
    const res = await POST(makeRequest({ projectId: PROJECT_ID, chapterId: CHAPTER_ID }))

    expect(res.status).toBe(202)

    const fetchedUrl = mockGlobalFetch.mock.calls[0]?.[0] as string | undefined
    expect(fetchedUrl).toBeDefined()
    expect(fetchedUrl).toContain('/translate/segments/async')
  })

  // -------------------------------------------------------------------------
  // Glossary forwarding (issue #30)
  //
  // Before calling the Worker, the BFF must fetch the project's glossary and
  // forward it in the request body so the translator can inject it into the
  // prompt. project_id must also be forwarded so the Worker can post extracted
  // new_terms back to /api/internal/worker-callback/glossary.
  // -------------------------------------------------------------------------
  it('fetches the project glossary and forwards it plus project_id to the Worker', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: USER_ID } as AuthReturn)
    mockProjectFindUnique.mockResolvedValueOnce({
      id: PROJECT_ID,
      ownerId: USER_ID,
      targetLang: TARGET_LANG,
    })
    mockChapterFindUnique.mockResolvedValueOnce({
      id: CHAPTER_ID,
      segments: [{ index: 0, source: SOURCE_TEXT }],
      projectId: PROJECT_ID,
    })
    mockJobCreate.mockResolvedValueOnce({ id: JOB_ID, status: 'PENDING' })
    mockGlossaryTermFindMany.mockResolvedValueOnce([
      {
        english: 'Hermione',
        translation: '赫敏',
        category: 'person',
        approved: true,
        aliasOf: null,
      },
      {
        english: 'Granger',
        translation: '格兰杰',
        category: 'person',
        approved: false,
        aliasOf: { english: 'Hermione', translation: '赫敏' },
      },
    ])

    mockGlobalFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ job_id: JOB_ID }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const { POST } = await import('@/app/api/jobs/route')
    const res = await POST(
      makeRequest({ projectId: PROJECT_ID, chapterId: CHAPTER_ID })
    )
    expect(res.status).toBe(202)

    // Glossary findMany must have been called for this project
    expect(mockGlossaryTermFindMany).toHaveBeenCalled()

    // Worker body must include project_id and the forwarded glossary
    const workerInit = mockGlobalFetch.mock.calls[0]?.[1] as
      | { body?: string }
      | undefined
    expect(workerInit?.body).toBeDefined()
    const parsed = JSON.parse(workerInit!.body!)
    expect(parsed.project_id).toBe(PROJECT_ID)
    expect(Array.isArray(parsed.glossary)).toBe(true)
    expect(parsed.glossary).toHaveLength(2)
    expect(parsed.glossary[0]).toMatchObject({
      english: 'Hermione',
      translation: '赫敏',
      category: 'person',
      approved: true,
    })
    expect(parsed.glossary[0].alias_of).toBeUndefined()
    expect(parsed.glossary[1]).toMatchObject({
      english: 'Granger',
      alias_of: { english: 'Hermione', translation: '赫敏' },
    })
    expect(parsed.bible).toBeUndefined() // no scan yet
  })

  it('omits glossary field when the project has no terms (not an empty array)', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: USER_ID } as AuthReturn)
    mockProjectFindUnique.mockResolvedValueOnce({
      id: PROJECT_ID,
      ownerId: USER_ID,
      targetLang: TARGET_LANG,
    })
    mockChapterFindUnique.mockResolvedValueOnce({
      id: CHAPTER_ID,
      segments: [{ index: 0, source: SOURCE_TEXT }],
      projectId: PROJECT_ID,
    })
    mockJobCreate.mockResolvedValueOnce({ id: JOB_ID, status: 'PENDING' })
    mockGlossaryTermFindMany.mockResolvedValueOnce([])

    mockGlobalFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ job_id: JOB_ID }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const { POST } = await import('@/app/api/jobs/route')
    await POST(makeRequest({ projectId: PROJECT_ID, chapterId: CHAPTER_ID }))

    const workerInit = mockGlobalFetch.mock.calls[0]?.[1] as
      | { body?: string }
      | undefined
    const parsed = JSON.parse(workerInit!.body!)
    expect(parsed.project_id).toBe(PROJECT_ID)
    // Keep the payload lean — the Worker treats null/undefined glossary as
    // "no injection" so there's no reason to send an empty array.
    expect(parsed.glossary).toBeUndefined()
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
      segments: [{ index: 0, source: SOURCE_TEXT }],
      projectId: PROJECT_ID,
      number: 1,
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

  // -------------------------------------------------------------------------
  // Phase 1: source text lives in Segment rows, joined in index order.
  // -------------------------------------------------------------------------
  it('sends every chapter segment with its index (segment-level translation)', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: USER_ID } as AuthReturn)
    mockProjectFindUnique.mockResolvedValueOnce({
      id: PROJECT_ID,
      ownerId: USER_ID,
      targetLang: TARGET_LANG,
    })
    mockChapterFindUnique.mockResolvedValueOnce({
      id: CHAPTER_ID,
      segments: [
        { index: 0, source: 'First paragraph.' },
        { index: 1, source: 'Second paragraph.' },
      ],
      projectId: PROJECT_ID,
      number: 1,
    })
    mockJobCreate.mockResolvedValueOnce({ id: JOB_ID, status: 'PENDING' })
    mockGlobalFetch.mockResolvedValueOnce(new Response('{}', { status: 202 }))

    const { POST } = await import('@/app/api/jobs/route')
    const res = await POST(makeRequest({ projectId: PROJECT_ID, chapterId: CHAPTER_ID }))
    expect(res.status).toBe(202)
    expect(mockChapterFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          segments: { select: { index: true, source: true }, orderBy: { index: 'asc' } },
        }),
      })
    )
    const body = JSON.parse((mockGlobalFetch.mock.calls[0]?.[1] as { body: string }).body)
    expect(body.segments).toEqual([
      { index: 0, source: 'First paragraph.' },
      { index: 1, source: 'Second paragraph.' },
    ])
    expect(body.source_text).toBeUndefined()
    // Chapter summaries are no longer injected — the rolling window replaces them.
    expect(body.context).toBeUndefined()
  })

  it('seeds the context window with the end of the previous chapter, oldest first', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: USER_ID } as AuthReturn)
    mockProjectFindUnique.mockResolvedValueOnce({
      id: PROJECT_ID,
      ownerId: USER_ID,
      targetLang: TARGET_LANG,
    })
    mockChapterFindUnique.mockResolvedValueOnce({
      id: CHAPTER_ID,
      segments: [{ index: 0, source: SOURCE_TEXT }],
      projectId: PROJECT_ID,
      number: 3,
    })
    // Query orders newest-first so `take` keeps the closest paragraphs.
    mockSegmentFindMany.mockResolvedValueOnce([
      { source: 'Last.', translation: '最后。' },
      { source: 'Before last.', translation: null },
    ])
    mockJobCreate.mockResolvedValueOnce({ id: JOB_ID, status: 'PENDING' })
    mockGlobalFetch.mockResolvedValueOnce(new Response('{}', { status: 202 }))

    const { POST } = await import('@/app/api/jobs/route')
    await POST(makeRequest({ projectId: PROJECT_ID, chapterId: CHAPTER_ID }))

    expect(mockSegmentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { chapter: { projectId: PROJECT_ID, number: { lt: 3 } } },
        orderBy: [{ chapter: { number: 'desc' } }, { index: 'desc' }],
      })
    )
    const body = JSON.parse((mockGlobalFetch.mock.calls[0]?.[1] as { body: string }).body)
    expect(body.preceding).toEqual([
      { source: 'Before last.', translation: null },
      { source: 'Last.', translation: '最后。' },
    ])
  })

  it.each([
    ['DRAFT', 'IDLE'],
    ['CONFIRMED', 'IDLE'],
    ['CONFIRMED', 'SCANNING'], // still used while a re-scan runs
    ['DRAFT', 'FAILED'], // ... and after a re-scan failed
  ])(
    'sends the %s bible (scan %s): style guide plus person cards, most-mentioned first',
    async (status, scanStatus) => {
      vi.mocked(auth).mockResolvedValueOnce({ userId: USER_ID } as AuthReturn)
      mockProjectFindUnique.mockResolvedValueOnce({
        id: PROJECT_ID,
        ownerId: USER_ID,
        targetLang: TARGET_LANG,
      })
      mockChapterFindUnique.mockResolvedValueOnce({
        id: CHAPTER_ID,
        segments: [{ index: 0, source: SOURCE_TEXT }],
        projectId: PROJECT_ID,
        number: 1,
      })
      mockBibleFindUnique.mockResolvedValueOnce({ status, scanStatus, styleGuide: '- 简洁' })
      mockGlossaryTermFindMany.mockResolvedValueOnce([
        { english: 'Ron', translation: '罗恩', category: 'person', approved: false,
          gender: 'male', voice: null, notes: null, mentions: 3, aliasOf: null },
        { english: 'Hermione', translation: '赫敏', category: 'person', approved: true,
          gender: 'female', voice: 'Precise.', notes: null, mentions: 9, aliasOf: null },
        { english: 'Granger', translation: '格兰杰', category: 'person', approved: false,
          gender: null, voice: null, notes: null, mentions: 0,
          aliasOf: { english: 'Hermione', translation: '赫敏' } },
        { english: 'Hogwarts', translation: '霍格沃茨', category: 'place', approved: false,
          gender: null, voice: null, notes: null, mentions: 20, aliasOf: null },
      ])
      mockJobCreate.mockResolvedValueOnce({ id: JOB_ID, status: 'PENDING' })
      mockGlobalFetch.mockResolvedValueOnce(new Response('{}', { status: 202 }))

      const { POST } = await import('@/app/api/jobs/route')
      await POST(makeRequest({ projectId: PROJECT_ID, chapterId: CHAPTER_ID }))

      const body = JSON.parse((mockGlobalFetch.mock.calls[0]?.[1] as { body: string }).body)
      // Only the book overview (stored as styleGuide); no character cards.
      expect(body.bible).toEqual({ style_guide: '- 简洁' })
    }
  )

  it('omits a bible that has never been drafted', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: USER_ID } as AuthReturn)
    mockProjectFindUnique.mockResolvedValueOnce({
      id: PROJECT_ID,
      ownerId: USER_ID,
      targetLang: TARGET_LANG,
    })
    mockChapterFindUnique.mockResolvedValueOnce({
      id: CHAPTER_ID,
      segments: [{ index: 0, source: SOURCE_TEXT }],
      projectId: PROJECT_ID,
      number: 1,
    })
    mockBibleFindUnique.mockResolvedValueOnce({ status: 'NONE', scanStatus: 'SCANNING', styleGuide: '' })
    mockJobCreate.mockResolvedValueOnce({ id: JOB_ID, status: 'PENDING' })
    mockGlobalFetch.mockResolvedValueOnce(new Response('{}', { status: 202 }))

    const { POST } = await import('@/app/api/jobs/route')
    await POST(makeRequest({ projectId: PROJECT_ID, chapterId: CHAPTER_ID }))
    const body = JSON.parse((mockGlobalFetch.mock.calls[0]?.[1] as { body: string }).body)
    expect(body.bible).toBeUndefined()
  })

  it.each([
    ['off by default', undefined, 0],
    ['off when the project leaves it off', false, 0],
    ['on when the project opts in', true, 1],
  ])('review is %s', async (_label, reviewEnabled, retries) => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: USER_ID } as AuthReturn)
    mockProjectFindUnique.mockResolvedValueOnce({
      id: PROJECT_ID,
      ownerId: USER_ID,
      targetLang: TARGET_LANG,
      ...(reviewEnabled === undefined ? {} : { reviewEnabled }),
    })
    mockChapterFindUnique.mockResolvedValueOnce({
      id: CHAPTER_ID,
      segments: [{ index: 0, source: SOURCE_TEXT }],
      projectId: PROJECT_ID,
      number: 1,
    })
    mockJobCreate.mockResolvedValueOnce({ id: JOB_ID, status: 'PENDING' })
    mockGlobalFetch.mockResolvedValueOnce(new Response('{}', { status: 202 }))

    const { POST } = await import('@/app/api/jobs/route')
    await POST(makeRequest({ projectId: PROJECT_ID, chapterId: CHAPTER_ID }))
    const body = JSON.parse((mockGlobalFetch.mock.calls[0]?.[1] as { body: string }).body)
    expect(body.config).toEqual({ review_max_retries: retries })
  })

  it('sends translation notes written without a scan', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: USER_ID } as AuthReturn)
    mockProjectFindUnique.mockResolvedValueOnce({ id: PROJECT_ID, ownerId: USER_ID, targetLang: TARGET_LANG })
    mockChapterFindUnique.mockResolvedValueOnce({
      id: CHAPTER_ID,
      segments: [{ index: 0, source: SOURCE_TEXT }],
      projectId: PROJECT_ID,
      number: 1,
    })
    mockBibleFindUnique.mockResolvedValueOnce({ status: 'NONE', scanStatus: 'IDLE', styleGuide: '- 保留敬称' })
    mockJobCreate.mockResolvedValueOnce({ id: JOB_ID, status: 'PENDING' })
    mockGlobalFetch.mockResolvedValueOnce(new Response('{}', { status: 202 }))

    const { POST } = await import('@/app/api/jobs/route')
    await POST(makeRequest({ projectId: PROJECT_ID, chapterId: CHAPTER_ID }))
    const body = JSON.parse((mockGlobalFetch.mock.calls[0]?.[1] as { body: string }).body)
    expect(body.bible).toEqual({ style_guide: '- 保留敬称' })
  })

  it.each([500, 422])('marks the job FAILED when the Worker responds %i', async (code) => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: USER_ID } as AuthReturn)
    mockProjectFindUnique.mockResolvedValueOnce({ id: PROJECT_ID, ownerId: USER_ID, targetLang: TARGET_LANG })
    mockChapterFindUnique.mockResolvedValueOnce({
      id: CHAPTER_ID,
      segments: [{ index: 0, source: SOURCE_TEXT }],
      projectId: PROJECT_ID,
      number: 1,
    })
    mockJobCreate.mockResolvedValueOnce({ id: JOB_ID, status: 'PENDING' })
    mockGlobalFetch.mockResolvedValueOnce(new Response('{}', { status: code }))

    const { POST } = await import('@/app/api/jobs/route')
    await POST(makeRequest({ projectId: PROJECT_ID, chapterId: CHAPTER_ID }))
    await vi.waitFor(() => expect(mockJobUpdate).toHaveBeenCalled())
    expect(mockJobUpdate).toHaveBeenCalledWith({
      where: { id: JOB_ID },
      data: { status: 'FAILED', error: 'Worker unavailable' },
    })
  })

  it('treats a long job that still reports progress as active (409)', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: USER_ID } as AuthReturn)
    mockProjectFindUnique.mockResolvedValueOnce({ id: PROJECT_ID, ownerId: USER_ID, targetLang: TARGET_LANG })
    mockChapterFindUnique.mockResolvedValueOnce({
      id: CHAPTER_ID,
      segments: [{ index: 0, source: SOURCE_TEXT }],
      projectId: PROJECT_ID,
      number: 1,
    })
    mockJobFindFirst.mockResolvedValueOnce({
      id: 'clh3p7b1p0009qzrmkf8g4zzz',
      status: 'RUNNING',
      createdAt: new Date(Date.now() - 30 * 60 * 1000),
      updatedAt: new Date(Date.now() - 60 * 1000), // progress a minute ago
    })
    const { POST } = await import('@/app/api/jobs/route')
    const res = await POST(makeRequest({ projectId: PROJECT_ID, chapterId: CHAPTER_ID }))
    expect(res.status).toBe(409)
    expect(mockJobCreate).not.toHaveBeenCalled()
  })

  it('replaces a job with no progress for 5 minutes', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: USER_ID } as AuthReturn)
    mockProjectFindUnique.mockResolvedValueOnce({ id: PROJECT_ID, ownerId: USER_ID, targetLang: TARGET_LANG })
    mockChapterFindUnique.mockResolvedValueOnce({
      id: CHAPTER_ID,
      segments: [{ index: 0, source: SOURCE_TEXT }],
      projectId: PROJECT_ID,
      number: 1,
    })
    mockJobFindFirst.mockResolvedValueOnce({
      id: 'clh3p7b1p0009qzrmkf8g4zzz',
      status: 'RUNNING',
      createdAt: new Date(Date.now() - 30 * 60 * 1000),
      updatedAt: new Date(Date.now() - 6 * 60 * 1000),
    })
    mockJobCreate.mockResolvedValueOnce({ id: JOB_ID, status: 'PENDING' })
    mockGlobalFetch.mockResolvedValueOnce(new Response('{}', { status: 202 }))
    const { POST } = await import('@/app/api/jobs/route')
    const res = await POST(makeRequest({ projectId: PROJECT_ID, chapterId: CHAPTER_ID }))
    expect(res.status).toBe(202)
  })

  it('returns 400 when the chapter has no segments', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: USER_ID } as AuthReturn)
    mockProjectFindUnique.mockResolvedValueOnce({
      id: PROJECT_ID,
      ownerId: USER_ID,
      targetLang: TARGET_LANG,
    })
    mockChapterFindUnique.mockResolvedValueOnce({
      id: CHAPTER_ID,
      segments: [],
      projectId: PROJECT_ID,
      number: 1,
    })
    const { POST } = await import('@/app/api/jobs/route')
    const res = await POST(makeRequest({ projectId: PROJECT_ID, chapterId: CHAPTER_ID }))
    expect(res.status).toBe(400)
    expect(mockJobCreate).not.toHaveBeenCalled()
  })
})
