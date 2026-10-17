import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSegmentFindMany = vi.fn()
const mockProjectUpdate = vi.fn()

vi.mock('@/lib/prisma', () => ({
  default: {
    segment: { findMany: (...a: unknown[]) => mockSegmentFindMany(...a) },
    project: { update: (...a: unknown[]) => mockProjectUpdate(...a) },
  },
}))

import { ensureSourceChars } from '@/lib/book-size'

describe('ensureSourceChars', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uses the size recorded at upload', async () => {
    expect(await ensureSourceChars('p1', 796_213)).toBe(796_213)
    expect(mockSegmentFindMany).not.toHaveBeenCalled()
  })

  it('measures and records the size once for books uploaded before it was tracked', async () => {
    mockSegmentFindMany.mockResolvedValueOnce([{ source: 'Abc.' }, { source: 'Defgh.' }])
    expect(await ensureSourceChars('p1', 0)).toBe(10)
    expect(mockSegmentFindMany).toHaveBeenCalledWith({
      where: { chapter: { projectId: 'p1' } },
      select: { source: true },
    })
    expect(mockProjectUpdate).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { sourceChars: 10 } })
  })

  it('does not write anything for an empty book', async () => {
    mockSegmentFindMany.mockResolvedValueOnce([])
    expect(await ensureSourceChars('p1', 0)).toBe(0)
    expect(mockProjectUpdate).not.toHaveBeenCalled()
  })
})
