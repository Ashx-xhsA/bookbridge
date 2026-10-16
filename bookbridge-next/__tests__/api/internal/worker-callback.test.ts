/**
 * Failing (red) tests for issue #61 — POST /api/internal/worker-callback.
 *
 * The Python Worker's /translate/segments/async dispatches a background task
 * that POSTs its result to this endpoint. We verify a shared secret in the
 * X-Worker-Secret header and then write per-segment translations plus the
 * job status via Prisma so the BFF poller can see it.
 *
 * These tests MUST fail until the route exists.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Mock Prisma singleton
//
// The route looks the job up first, then applies every write in one
// array-form $transaction (segments first, job status last). Each mocked
// write returns a tagged object so tests can assert the transaction order.
// ---------------------------------------------------------------------------
const mockJobFindUnique = vi.fn()
const mockJobUpdate = vi.fn((args: unknown) => ({ op: 'job.update', args }))
const mockChapterUpdate = vi.fn((args: unknown) => ({ op: 'chapter.update', args }))
const mockSegmentUpdateMany = vi.fn((args: unknown) => ({ op: 'segment.updateMany', args }))
const mockTransaction = vi.fn(async (ops: unknown[]) => ops)

vi.mock('@/lib/prisma', () => ({
  default: {
    translationJob: {
      findUnique: (...args: unknown[]) => mockJobFindUnique(...args),
      update: (args: unknown) => mockJobUpdate(args),
    },
    chapter: { update: (args: unknown) => mockChapterUpdate(args) },
    segment: { updateMany: (args: unknown) => mockSegmentUpdateMany(args) },
    $transaction: (ops: unknown[]) => mockTransaction(ops),
  },
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const JOB_ID = 'clh3p7b1p0003qzrmkf8g4m0k'
const CHAPTER_ID = 'clh3p7b1p0002qzrmkf8g4m0j'
const SECRET = 'test-shared-secret'
const OK_BODY = {
  job_id: JOB_ID,
  status: 'SUCCEEDED',
  segments: [{ index: 0, translation: 'x' }],
  failed_indices: [],
}

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
    mockJobFindUnique.mockResolvedValue({ id: JOB_ID, chapterId: CHAPTER_ID, status: 'PENDING' })
  })

  // -------------------------------------------------------------------------
  // Shared-secret auth (server-to-server)
  // -------------------------------------------------------------------------
  it('returns 401 when X-Worker-Secret header is missing', async () => {
    const { POST } = await import('@/app/api/internal/worker-callback/route')
    const res = await POST(
      makeRequest(OK_BODY)
    )
    expect(res.status).toBe(401)
    expect(mockJobUpdate).not.toHaveBeenCalled()
  })

  it('returns 401 when X-Worker-Secret does not match env secret', async () => {
    const { POST } = await import('@/app/api/internal/worker-callback/route')
    const res = await POST(
      makeRequest(
        OK_BODY,
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
        OK_BODY,
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

  it('returns 400 when status is not RUNNING, SUCCEEDED or FAILED', async () => {
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

  it.each([
    { segments: [{ index: -1, translation: 'x' }] },
    { segments: [{ index: 0, translation: '' }] },
    { failed_indices: ['a'] },
  ])('returns 400 for malformed segment results %#', async (patch) => {
    const { POST } = await import('@/app/api/internal/worker-callback/route')
    const res = await POST(makeRequest({ ...OK_BODY, ...patch }, { 'X-Worker-Secret': SECRET }))
    expect(res.status).toBe(400)
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Success — per-segment writes, then the job, in one transaction
  // -------------------------------------------------------------------------
  it('writes each segment translation and marks the job SUCCEEDED last', async () => {
    const { POST } = await import('@/app/api/internal/worker-callback/route')
    const res = await POST(
      makeRequest(
        {
          ...OK_BODY,
          segments: [
            { index: 0, translation: '狗咬了那个男人。' },
            { index: 2, translation: '第三段。' },
          ],
          summary: 'A dog bites a man.',
        },
        { 'X-Worker-Secret': SECRET }
      )
    )
    expect(res.status).toBe(200)
    expect(mockSegmentUpdateMany).toHaveBeenCalledWith({
      where: { chapterId: CHAPTER_ID, index: 0 },
      data: { translation: '狗咬了那个男人。', status: 'translated' },
    })
    expect(mockSegmentUpdateMany).toHaveBeenCalledWith({
      where: { chapterId: CHAPTER_ID, index: 2 },
      data: { translation: '第三段。', status: 'translated' },
    })
    expect(mockChapterUpdate).toHaveBeenCalledWith({
      where: { id: CHAPTER_ID },
      data: { summary: 'A dog bites a man.' },
    })
    expect(mockJobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: JOB_ID },
        data: expect.objectContaining({ status: 'SUCCEEDED' }),
      })
    )
    expect(mockTransaction).toHaveBeenCalledTimes(1)
    const ops = mockTransaction.mock.calls[0][0] as { op: string }[]
    expect(ops.at(-1)?.op).toBe('job.update')
  })

  it('only updates the job when it has no chapterId', async () => {
    mockJobFindUnique.mockResolvedValueOnce({ id: JOB_ID, chapterId: null, status: 'PENDING' })
    const { POST } = await import('@/app/api/internal/worker-callback/route')
    const res = await POST(makeRequest(OK_BODY, { 'X-Worker-Secret': SECRET }))
    expect(res.status).toBe(200)
    expect(mockSegmentUpdateMany).not.toHaveBeenCalled()
    expect(mockJobUpdate).toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Failure — keep partial results, flag failed segments
  // -------------------------------------------------------------------------
  it('keeps translated segments and flags failed ones on a partial failure', async () => {
    const { POST } = await import('@/app/api/internal/worker-callback/route')
    const res = await POST(
      makeRequest(
        {
          job_id: JOB_ID,
          status: 'FAILED',
          error: '1 of 2 segments failed to translate',
          segments: [{ index: 0, translation: '甲' }],
          failed_indices: [1],
        },
        { 'X-Worker-Secret': SECRET }
      )
    )
    expect(res.status).toBe(200)
    expect(mockSegmentUpdateMany).toHaveBeenCalledWith({
      where: { chapterId: CHAPTER_ID, index: 0 },
      data: { translation: '甲', status: 'translated' },
    })
    expect(mockSegmentUpdateMany).toHaveBeenCalledWith({
      where: { chapterId: CHAPTER_ID, index: { in: [1] } },
      data: { status: 'failed' },
    })
    expect(mockJobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          error: '1 of 2 segments failed to translate',
        }),
      })
    )
  })

  it('updates only the job on a total failure', async () => {
    const { POST } = await import('@/app/api/internal/worker-callback/route')
    const res = await POST(
      makeRequest(
        { job_id: JOB_ID, status: 'FAILED', error: 'Translation failed' },
        { 'X-Worker-Secret': SECRET }
      )
    )
    expect(res.status).toBe(200)
    expect(mockSegmentUpdateMany).not.toHaveBeenCalled()
    expect(mockChapterUpdate).not.toHaveBeenCalled()
    expect(mockJobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED', error: 'Translation failed' }),
      })
    )
  })

  it('stores a progress batch and keeps the job RUNNING (heartbeat)', async () => {
    const { POST } = await import('@/app/api/internal/worker-callback/route')
    const res = await POST(
      makeRequest(
        { job_id: JOB_ID, status: 'RUNNING', segments: [{ index: 3, translation: '丁' }] },
        { 'X-Worker-Secret': SECRET }
      )
    )
    expect(res.status).toBe(200)
    expect(mockSegmentUpdateMany).toHaveBeenCalledWith({
      where: { chapterId: CHAPTER_ID, index: 3 },
      data: { translation: '丁', status: 'translated' },
    })
    expect(mockJobUpdate).toHaveBeenCalledWith({
      where: { id: JOB_ID },
      data: { status: 'RUNNING' },
    })
  })

  it.each(['SUCCEEDED', 'FAILED'])(
    'ignores a late callback for a job that is already %s',
    async (status) => {
      mockJobFindUnique.mockResolvedValueOnce({ id: JOB_ID, chapterId: CHAPTER_ID, status })
      const { POST } = await import('@/app/api/internal/worker-callback/route')
      const res = await POST(makeRequest(OK_BODY, { 'X-Worker-Secret': SECRET }))
      expect(res.status).toBe(409)
      expect(mockTransaction).not.toHaveBeenCalled()
    }
  )

  it('returns 404 when job does not exist', async () => {
    mockJobFindUnique.mockResolvedValueOnce(null)
    const { POST } = await import('@/app/api/internal/worker-callback/route')
    const res = await POST(makeRequest(OK_BODY, { 'X-Worker-Secret': SECRET }))
    expect(res.status).toBe(404)
    expect(mockTransaction).not.toHaveBeenCalled()
  })
})
