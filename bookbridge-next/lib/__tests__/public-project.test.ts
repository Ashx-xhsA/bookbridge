/**
 * Unit tests for lib/public-project.ts
 *
 * The helpers are the single source of truth for the enumeration-prevention
 * query (WHERE publicToken = token AND isPublic = true). The route-level tests
 * mock findFirst directly, so without these unit tests there is no coverage
 * that would catch a caller accidentally dropping the `isPublic: true` filter
 * and leaking unpublished-project existence.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockProjectFindFirst = vi.fn()
const mockSegmentFindMany = vi.fn()

vi.mock('@/lib/prisma', () => ({
  default: {
    project: {
      findFirst: (...args: unknown[]) => mockProjectFindFirst(...args),
    },
    segment: {
      findMany: (...args: unknown[]) => mockSegmentFindMany(...args),
    },
  },
}))

describe('getPublishedProjectId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('queries with isPublic=true filter to enforce the enumeration invariant', async () => {
    mockProjectFindFirst.mockResolvedValueOnce({ id: 'proj_1' })
    const { getPublishedProjectId } = await import('@/lib/public-project')

    await getPublishedProjectId('some-token')

    expect(mockProjectFindFirst).toHaveBeenCalledTimes(1)
    const [args] = mockProjectFindFirst.mock.calls[0]
    expect(args.where).toEqual({
      publicToken: 'some-token',
      isPublic: true,
    })
  })

  it('returns just the id, not the full project payload', async () => {
    mockProjectFindFirst.mockResolvedValueOnce({
      id: 'proj_1',
      title: 'Secret',
      ownerId: 'user_1',
    })
    const { getPublishedProjectId } = await import('@/lib/public-project')

    const result = await getPublishedProjectId('some-token')

    expect(result).toBe('proj_1')
  })

  it('returns null when no published project matches', async () => {
    mockProjectFindFirst.mockResolvedValueOnce(null)
    const { getPublishedProjectId } = await import('@/lib/public-project')

    const result = await getPublishedProjectId('some-token')

    expect(result).toBeNull()
  })
})

describe('getPublishedProjectWithChapters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('queries with isPublic=true filter and includes chapters ordered by number', async () => {
    mockProjectFindFirst.mockResolvedValueOnce({ id: 'proj_1', chapters: [] })
    const { getPublishedProjectWithChapters } = await import(
      '@/lib/public-project'
    )

    await getPublishedProjectWithChapters('some-token')

    const [args] = mockProjectFindFirst.mock.calls[0]
    expect(args.where).toEqual({
      publicToken: 'some-token',
      isPublic: true,
    })
    expect(args.include.chapters.orderBy).toEqual({ number: 'asc' })
    // Chapter response must not leak sourceContent/translation at this layer —
    // that is fetched per-chunk via the dedicated route.
    expect(args.include.chapters.select).toEqual({
      id: true,
      number: true,
      title: true,
    })
  })
})

describe('getPublishedProjectForReader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null for an unknown or unpublished token without loading text', async () => {
    mockProjectFindFirst.mockResolvedValueOnce(null)
    const { getPublishedProjectForReader } = await import('@/lib/public-project')

    expect(await getPublishedProjectForReader('some-token')).toBeNull()
    const [args] = mockProjectFindFirst.mock.calls[0]
    expect(args.where).toEqual({ publicToken: 'some-token', isPublic: true })
    expect(mockSegmentFindMany).not.toHaveBeenCalled()
  })

  it('loads the chapter outline plus only the first chapter, without review details', async () => {
    mockProjectFindFirst.mockResolvedValueOnce({
      id: 'proj_1',
      title: 'Book',
      sourceLang: 'en',
      targetLang: 'zh-Hans',
      chapters: [
        { id: 'c1', number: 1, title: 'One', _count: { segments: 2 }, segments: [] },
        { id: 'c2', number: 2, title: 'Two', _count: { segments: 3 }, segments: [{ id: 's9' }] },
      ],
    })
    mockSegmentFindMany.mockResolvedValueOnce([
      { index: 0, source: 'A.', translation: '甲', status: 'flagged',
        reviewIssues: [{ category: 'omission', severity: 'error', message: 'secret' }] },
    ])
    const { getPublishedProjectForReader } = await import('@/lib/public-project')

    const reader = await getPublishedProjectForReader('some-token')

    const [args] = mockProjectFindFirst.mock.calls[0]
    // The outline query must not pull paragraph text for the whole book.
    expect(JSON.stringify(args.select.chapters)).not.toContain('source')
    expect(mockSegmentFindMany).toHaveBeenCalledTimes(1)
    expect(mockSegmentFindMany.mock.calls[0][0].where).toEqual({ chapterId: 'c1' })
    expect(reader).toEqual({
      title: 'Book',
      sourceLang: 'en',
      targetLang: 'zh-Hans',
      chapters: [
        { key: 'c1', id: 'c1', number: 1, title: 'One', done: true },
        { key: 'c2', id: 'c2', number: 2, title: 'Two', done: false },
      ],
      initialRows: { c1: [{ index: 0, source: 'A.', translation: '甲' }] },
    })
  })
})
