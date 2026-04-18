import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkMiddleware: vi.fn(() => vi.fn()),
  createRouteMatcher: vi.fn(() => vi.fn()),
}))

const mockProjectCreate = vi.fn()
const mockProjectUpdate = vi.fn()
const mockChapterCreateMany = vi.fn()
const mockTranslationJobCreate = vi.fn()
const mockUserUpsert = vi.fn()
const mockTransaction = vi.fn(async (ops: unknown[]) => ops)

vi.mock('@/lib/prisma', () => ({
  default: {
    project: {
      create: (...args: unknown[]) => mockProjectCreate(...args),
      update: (...args: unknown[]) => mockProjectUpdate(...args),
    },
    chapter: {
      createMany: (...args: unknown[]) => mockChapterCreateMany(...args),
    },
    translationJob: {
      create: (...args: unknown[]) => mockTranslationJobCreate(...args),
    },
    user: {
      upsert: (...args: unknown[]) => mockUserUpsert(...args),
    },
    $transaction: (ops: unknown[]) => mockTransaction(ops),
  },
}))

vi.mock('@/lib/worker', () => ({
  workerFetch: vi.fn(),
}))

import { auth } from '@clerk/nextjs/server'
import { workerFetch } from '@/lib/worker'

type AuthReturn = Awaited<ReturnType<typeof auth>>

function fakeRequest(fields: Record<string, unknown>): import('next/server').NextRequest {
  const fakeFormData = {
    get: (key: string) => (key in fields ? fields[key] : null),
  }
  return { formData: () => Promise.resolve(fakeFormData) } as unknown as import('next/server').NextRequest
}

describe('POST /api/upload — unit tests via mocked formData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mockUserUpsert.mockResolvedValue({ id: 'u1' })
    mockProjectCreate.mockResolvedValue({ id: 'proj-new' })
    mockProjectUpdate.mockResolvedValue({})
    mockChapterCreateMany.mockResolvedValue({ count: 0 })
    mockTranslationJobCreate.mockResolvedValue({ id: 'job-1' })
  })

  it('returns 401 when user is not authenticated', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: null } as AuthReturn)
    const { POST } = await import('@/app/api/upload/route')
    const res = await POST(fakeRequest({ file: { name: 'test.pdf' }, title: 'Book' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when no PDF file is provided', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: 'user_abc' } as AuthReturn)
    const { POST } = await import('@/app/api/upload/route')
    const res = await POST(fakeRequest({ file: null, title: 'Book' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('PDF')
  })

  it('writes chapters and sets project READY when worker returns chunks', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: 'user_abc' } as AuthReturn)
    vi.mocked(workerFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          job_id: 'wjob-1',
          status: 'completed',
          chunks: [
            { chunk_id: 1, title: 'Ch 1', start_page: 1, end_page: 10, page_count: 10 },
          ],
        }),
        { status: 200 }
      )
    )
    const { POST } = await import('@/app/api/upload/route')
    const res = await POST(
      fakeRequest({ file: { name: 'novel.pdf' }, title: 'My Novel', targetLang: 'zh-Hans' })
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.projectId).toBe('proj-new')
    expect(mockChapterCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({ number: 1, title: 'Ch 1', startPage: 1, endPage: 10, pageCount: 10 }),
        ],
      })
    )
    expect(mockProjectUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'READY' }) })
    )
  })

  it('marks project DRAFT and returns 502 when worker is unreachable', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: 'user_abc' } as AuthReturn)
    vi.mocked(workerFetch).mockRejectedValueOnce(new Error('Worker unavailable'))
    const { POST } = await import('@/app/api/upload/route')
    const res = await POST(fakeRequest({ file: { name: 'doc.pdf' }, title: 'Doc' }))
    expect(res.status).toBe(502)
    expect(mockChapterCreateMany).not.toHaveBeenCalled()
    expect(mockProjectUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'DRAFT' }) })
    )
    expect(mockTranslationJobCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) })
    )
  })

  it('propagates worker 422 status to client when PDF has no chapters', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: 'user_abc' } as AuthReturn)
    vi.mocked(workerFetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'No chapter markers found in the PDF.' }), {
        status: 422,
      })
    )
    const { POST } = await import('@/app/api/upload/route')
    const res = await POST(fakeRequest({ file: { name: 'blank.pdf' }, title: 'Blank' }))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toContain('chapter')
    expect(mockChapterCreateMany).not.toHaveBeenCalled()
  })
})
