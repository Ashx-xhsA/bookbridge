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

vi.mock('@/lib/prisma', () => ({
  default: {
    project: {
      findFirst: (...args: unknown[]) => mockProjectFindFirst(...args),
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
