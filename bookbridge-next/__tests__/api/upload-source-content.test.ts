/**
 * Failing (red) tests for issue #51 — surface 1:
 * POST /api/upload must persist sourceContent per chunk.
 *
 * The worker /parse response now includes a `content` field per chunk.
 * The route must write `sourceContent: ch.content` in the
 * chapter.createMany call.  Today that field is not mapped, so all
 * assertions on `sourceContent` will fail.
 */

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

describe('POST /api/upload — sourceContent persistence (issue #51)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mockUserUpsert.mockResolvedValue({ id: 'u1' })
    mockProjectCreate.mockResolvedValue({ id: 'proj-new' })
    mockProjectUpdate.mockResolvedValue({})
    mockChapterCreateMany.mockResolvedValue({ count: 0 })
    mockTranslationJobCreate.mockResolvedValue({ id: 'job-1' })
  })

  it('maps content field from worker chunk into sourceContent in createMany data', async () => {
    // Worker now returns `content` per chunk (issue #51 requirement)
    vi.mocked(auth).mockResolvedValueOnce({ userId: 'user_abc' } as AuthReturn)
    vi.mocked(workerFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          job_id: 'wjob-1',
          status: 'completed',
          chunks: [
            {
              chunk_id: 1,
              title: 'Chapter One',
              start_page: 1,
              end_page: 12,
              page_count: 12,
              content: 'It was a bright cold day in April, and the clocks were striking thirteen.',
            },
          ],
        }),
        { status: 200 }
      )
    )
    const { POST } = await import('@/app/api/upload/route')
    const res = await POST(
      fakeRequest({ file: { name: 'novel.pdf' }, title: 'Nineteen Eighty-Four', targetLang: 'zh-Hans' })
    )
    expect(res.status).toBe(200)
    // THE FAILING ASSERTION: sourceContent must appear in the createMany data.
    // Currently the route maps only chunk_id/title/start_page/end_page/page_count
    // and does NOT include content → sourceContent.
    expect(mockChapterCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            sourceContent: 'It was a bright cold day in April, and the clocks were striking thirteen.',
          }),
        ]),
      })
    )
  })

  it('maps sourceContent for each of multiple chunks returned by worker', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: 'user_abc' } as AuthReturn)
    vi.mocked(workerFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          job_id: 'wjob-2',
          status: 'completed',
          chunks: [
            { chunk_id: 1, title: 'Part I', start_page: 1, end_page: 5, page_count: 5, content: 'Text of part one.' },
            { chunk_id: 2, title: 'Part II', start_page: 6, end_page: 10, page_count: 5, content: 'Text of part two.' },
          ],
        }),
        { status: 200 }
      )
    )
    const { POST } = await import('@/app/api/upload/route')
    await POST(
      fakeRequest({ file: { name: 'book.pdf' }, title: 'Two Parts', targetLang: 'fr' })
    )
    // Both chunks must carry their respective sourceContent values.
    expect(mockChapterCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ number: 1, sourceContent: 'Text of part one.' }),
          expect.objectContaining({ number: 2, sourceContent: 'Text of part two.' }),
        ]),
      })
    )
  })

  it('writes null sourceContent (not undefined) when worker chunk has no content field', async () => {
    // Graceful fallback: if the worker omits content, sourceContent should be null,
    // not undefined (which Prisma would silently drop causing a schema mismatch).
    vi.mocked(auth).mockResolvedValueOnce({ userId: 'user_abc' } as AuthReturn)
    vi.mocked(workerFetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          job_id: 'wjob-3',
          status: 'completed',
          chunks: [
            { chunk_id: 1, title: 'Epilogue', start_page: 200, end_page: 210, page_count: 11 },
          ],
        }),
        { status: 200 }
      )
    )
    const { POST } = await import('@/app/api/upload/route')
    await POST(
      fakeRequest({ file: { name: 'old.pdf' }, title: 'Legacy Book' })
    )
    // THE FAILING ASSERTION: the route currently does not set sourceContent at all.
    // It must set it to null (not undefined) when content is absent on the chunk.
    const callArg = mockChapterCreateMany.mock.calls[0]?.[0]
    expect(callArg).toBeDefined()
    const firstItem = callArg.data[0]
    expect(Object.prototype.hasOwnProperty.call(firstItem, 'sourceContent')).toBe(true)
    expect(firstItem.sourceContent).toBeNull()
  })
})
