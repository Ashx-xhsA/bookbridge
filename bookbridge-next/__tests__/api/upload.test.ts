import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkMiddleware: vi.fn(() => vi.fn()),
  createRouteMatcher: vi.fn(() => vi.fn()),
}))

const mockProjectCreate = vi.fn()
const mockProjectUpdate = vi.fn()
const mockChapterCreate = vi.fn()
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
      create: (...args: unknown[]) => mockChapterCreate(...args),
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
    mockChapterCreate.mockResolvedValue({ id: 'ch-1' })
    mockTranslationJobCreate.mockResolvedValue({ id: 'job-1' })
  })

  it('returns 401 when user is not authenticated', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: null } as AuthReturn)
    const { POST } = await import('@/app/api/upload/route')
    const res = await POST(fakeRequest({ file: { name: 'test.epub' }, title: 'Book' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when no file is provided', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: 'user_abc' } as AuthReturn)
    const { POST } = await import('@/app/api/upload/route')
    const res = await POST(fakeRequest({ file: null, title: 'Book' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('EPUB')
  })

  it('returns 400 for a PDF upload without calling the worker', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: 'user_abc' } as AuthReturn)
    const { POST } = await import('@/app/api/upload/route')
    const res = await POST(fakeRequest({ file: { name: 'book.pdf' }, title: 'Book' }))
    expect(res.status).toBe(400)
    expect(workerFetch).not.toHaveBeenCalled()
    expect(mockProjectCreate).not.toHaveBeenCalled()
  })

  it.each(['novel.epub', 'NOVEL.TXT'])('accepts %s', async (name) => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: 'user_abc' } as AuthReturn)
    vi.mocked(workerFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          job_id: 'wjob-1',
          status: 'completed',
          chapters: [{ number: 1, title: 'One', paragraphs: ['Hi.'] }],
        }),
        { status: 200 }
      )
    )
    const { POST } = await import('@/app/api/upload/route')
    const res = await POST(fakeRequest({ file: { name }, title: 'Book' }))
    expect(res.status).toBe(200)
  })

  it('writes chapters with ordered segments and sets project READY', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: 'user_abc' } as AuthReturn)
    vi.mocked(workerFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          job_id: 'wjob-1',
          status: 'completed',
          chapters: [
            { number: 1, title: 'Ch 1', paragraphs: ['First.', 'Second.'] },
            { number: 2, title: 'Ch 2', paragraphs: ['Third.'] },
          ],
        }),
        { status: 200 }
      )
    )
    const { POST } = await import('@/app/api/upload/route')
    const res = await POST(
      fakeRequest({ file: { name: 'novel.epub' }, title: 'My Novel', targetLang: 'zh-Hans' })
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.projectId).toBe('proj-new')
    expect(mockChapterCreate).toHaveBeenCalledTimes(2)
    expect(mockChapterCreate).toHaveBeenNthCalledWith(1, {
      data: {
        projectId: 'proj-new',
        number: 1,
        title: 'Ch 1',
        segments: {
          createMany: {
            data: [
              { index: 0, source: 'First.' },
              { index: 1, source: 'Second.' },
            ],
          },
        },
      },
    })
    expect(mockProjectUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'READY' }) })
    )
  })

  it('treats a malformed worker response as a failure', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: 'user_abc' } as AuthReturn)
    vi.mocked(workerFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ job_id: 'w', status: 'completed', chapters: [{ number: 'x' }] }),
        { status: 200 }
      )
    )
    const { POST } = await import('@/app/api/upload/route')
    const res = await POST(fakeRequest({ file: { name: 'novel.txt' }, title: 'Book' }))
    expect(res.status).toBe(502)
    expect(mockChapterCreate).not.toHaveBeenCalled()
  })

  it('marks project DRAFT and returns 502 when worker is unreachable', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: 'user_abc' } as AuthReturn)
    vi.mocked(workerFetch).mockRejectedValueOnce(new Error('Worker unavailable'))
    const { POST } = await import('@/app/api/upload/route')
    const res = await POST(fakeRequest({ file: { name: 'doc.epub' }, title: 'Doc' }))
    expect(res.status).toBe(502)
    expect(mockChapterCreate).not.toHaveBeenCalled()
    expect(mockProjectUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'DRAFT' }) })
    )
    expect(mockTranslationJobCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) })
    )
  })

  it('propagates worker 422 detail to client (e.g. DRM-protected EPUB)', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: 'user_abc' } as AuthReturn)
    vi.mocked(workerFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ detail: 'This EPUB is DRM-protected and cannot be translated.' }),
        { status: 422 }
      )
    )
    const { POST } = await import('@/app/api/upload/route')
    const res = await POST(fakeRequest({ file: { name: 'drm.epub' }, title: 'Locked' }))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toContain('DRM')
    expect(mockChapterCreate).not.toHaveBeenCalled()
  })
})
