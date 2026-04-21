import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkMiddleware: vi.fn(() => vi.fn()),
  createRouteMatcher: vi.fn(() => vi.fn()),
}))

const mockFindMany = vi.fn()

vi.mock('@/lib/prisma', () => ({
  default: {
    project: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}))

import { auth } from '@clerk/nextjs/server'

describe('GET /api/projects', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when user is not authenticated', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: null } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
    const { GET } = await import('@/app/api/projects/route')
    const res = await GET()
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Unauthorized')
  })

  it('returns projects for the authenticated user', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: 'user_abc' } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
    const fakeProjects = [
      { id: 'p1', title: 'Test Book', chapters: [], _count: { jobs: 0, glossary: 0 } },
    ]
    mockFindMany.mockResolvedValueOnce(fakeProjects)

    const { GET } = await import('@/app/api/projects/route')
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual(fakeProjects)
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ownerId: 'user_abc' } })
    )
  })
})
