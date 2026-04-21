/**
 * Failing (red) tests for issue #61 — POST /api/internal/worker-callback.
 *
 * The Python Worker's /translate/chunk/async dispatches a background task
 * that POSTs its result to this endpoint. We verify a shared secret in the
 * X-Worker-Secret header and then write status / translatedContent / error
 * to the TranslationJob row via Prisma so the BFF poller can see it.
 *
 * These tests MUST fail until the route exists.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Mock Prisma singleton
// ---------------------------------------------------------------------------
const mockJobUpdate = vi.fn()
const mockChapterUpdate = vi.fn()

vi.mock('@/lib/prisma', () => ({
  default: {
    translationJob: {
      update: (...args: unknown[]) => mockJobUpdate(...args),
    },
    chapter: {
      update: (...args: unknown[]) => mockChapterUpdate(...args),
    },
  },
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const JOB_ID = 'clh3p7b1p0003qzrmkf8g4m0k'
const CHAPTER_ID = 'clh3p7b1p0002qzrmkf8g4m0j'
const SECRET = 'test-shared-secret'

function makeRequest(
  body: Record<string, unknown>,
  headers: Record<string, string> = {}
): NextRequest {
  return new NextRequest('http://localhost:3000/api/internal/worker-callback', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

describe('POST /api/internal/worker-callback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    process.env.WORKER_CALLBACK_SECRET = SECRET
  })

  // -------------------------------------------------------------------------
  // Shared-secret auth (server-to-server)
  // -------------------------------------------------------------------------
  it('returns 401 when X-Worker-Secret header is missing', async () => {
    const { POST } = await import('@/app/api/internal/worker-callback/route')
    const res = await POST(
      makeRequest({ job_id: JOB_ID, status: 'SUCCEEDED', translated_content: 'x' })
    )
    expect(res.status).toBe(401)
    expect(mockJobUpdate).not.toHaveBeenCalled()
  })

  it('returns 401 when X-Worker-Secret does not match env secret', async () => {
    const { POST } = await import('@/app/api/internal/worker-callback/route')
    const res = await POST(
      makeRequest(
        { job_id: JOB_ID, status: 'SUCCEEDED', translated_content: 'x' },
        { 'X-Worker-Secret': 'wrong' }
      )
    )
    expect(res.status).toBe(401)
    expect(mockJobUpdate).not.toHaveBeenCalled()
  })

  it('returns 500 when WORKER_CALLBACK_SECRET env var is not configured', async () => {
    delete process.env.WORKER_CALLBACK_SECRET
    const { POST } = await import('@/app/api/internal/worker-callback/route')
    const res = await POST(
      makeRequest(
        { job_id: JOB_ID, status: 'SUCCEEDED', translated_content: 'x' },
        { 'X-Worker-Secret': SECRET }
      )
    )
    // Refuses to authenticate — better to fail closed than accept any secret
    expect(res.status).toBe(500)
    expect(mockJobUpdate).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Input validation
  // -------------------------------------------------------------------------
  it('returns 400 when body is missing required fields', async () => {
    const { POST } = await import('@/app/api/internal/worker-callback/route')
    const res = await POST(
      makeRequest({ job_id: JOB_ID }, { 'X-Worker-Secret': SECRET })
    )
    expect(res.status).toBe(400)
    expect(mockJobUpdate).not.toHaveBeenCalled()
  })

  it('returns 400 when status is not SUCCEEDED or FAILED', async () => {
    const { POST } = await import('@/app/api/internal/worker-callback/route')
    const res = await POST(
      makeRequest(
        { job_id: JOB_ID, status: 'PENDING' },
        { 'X-Worker-Secret': SECRET }
      )
    )
    expect(res.status).toBe(400)
    expect(mockJobUpdate).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Happy path — success (mirrors translation onto chapter.translation so the
  // reader UI can display it without joining through the job table)
  // -------------------------------------------------------------------------
  it('updates job and chapter with translatedContent when status is SUCCEEDED', async () => {
    mockJobUpdate.mockResolvedValueOnce({
      id: JOB_ID,
      chapterId: CHAPTER_ID,
    })
    mockChapterUpdate.mockResolvedValueOnce({ id: CHAPTER_ID })

    const { POST } = await import('@/app/api/internal/worker-callback/route')
    const res = await POST(
      makeRequest(
        {
          job_id: JOB_ID,
          status: 'SUCCEEDED',
          translated_content: '狗咬了那个男人。',
        },
        { 'X-Worker-Secret': SECRET }
      )
    )
    expect(res.status).toBe(200)
    expect(mockJobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: JOB_ID },
        data: expect.objectContaining({
          status: 'SUCCEEDED',
          translatedContent: '狗咬了那个男人。',
        }),
      })
    )
    expect(mockChapterUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CHAPTER_ID },
        data: { translation: '狗咬了那个男人。' },
      })
    )
  })

  it('does not update chapter.translation when job has no chapterId', async () => {
    mockJobUpdate.mockResolvedValueOnce({ id: JOB_ID, chapterId: null })

    const { POST } = await import('@/app/api/internal/worker-callback/route')
    const res = await POST(
      makeRequest(
        { job_id: JOB_ID, status: 'SUCCEEDED', translated_content: 'x' },
        { 'X-Worker-Secret': SECRET }
      )
    )
    expect(res.status).toBe(200)
    expect(mockChapterUpdate).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Happy path — failure (must NOT touch chapter.translation)
  // -------------------------------------------------------------------------
  it('updates job with FAILED + error message when status is FAILED', async () => {
    mockJobUpdate.mockResolvedValueOnce({ id: JOB_ID, chapterId: CHAPTER_ID })
    const { POST } = await import('@/app/api/internal/worker-callback/route')
    const res = await POST(
      makeRequest(
        { job_id: JOB_ID, status: 'FAILED', error: 'Translation failed' },
        { 'X-Worker-Secret': SECRET }
      )
    )
    expect(res.status).toBe(200)
    expect(mockJobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: JOB_ID },
        data: expect.objectContaining({
          status: 'FAILED',
          error: 'Translation failed',
        }),
      })
    )
    expect(mockChapterUpdate).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Edge — job not found in DB (Prisma P2025)
  // -------------------------------------------------------------------------
  it('returns 404 when job does not exist', async () => {
    const notFound = Object.assign(new Error('not found'), {
      code: 'P2025',
    })
    mockJobUpdate.mockRejectedValueOnce(notFound)

    const { POST } = await import('@/app/api/internal/worker-callback/route')
    const res = await POST(
      makeRequest(
        { job_id: JOB_ID, status: 'SUCCEEDED', translated_content: 'x' },
        { 'X-Worker-Secret': SECRET }
      )
    )
    expect(res.status).toBe(404)
  })
})
