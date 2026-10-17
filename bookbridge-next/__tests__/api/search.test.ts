import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkMiddleware: vi.fn(() => vi.fn()),
  createRouteMatcher: vi.fn(() => vi.fn()),
}))

const mockProjectFindUnique = vi.fn()
const mockProjectFindFirst = vi.fn()
const mockSegmentFindMany = vi.fn()

vi.mock('@/lib/prisma', () => ({
  default: {
    project: {
      findUnique: (...args: unknown[]) => mockProjectFindUnique(...args),
      findFirst: (...args: unknown[]) => mockProjectFindFirst(...args),
    },
    segment: {
      findMany: (...args: unknown[]) => mockSegmentFindMany(...args),
    },
  },
}))

import { auth } from '@clerk/nextjs/server'

type AuthResult = ReturnType<typeof auth> extends Promise<infer T> ? T : never

const TOKEN = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

const hit = {
  index: 4,
  source: 'One morning Gregor Samsa woke from troubled dreams.',
  translation: '一天早晨，格里高尔·萨姆沙从不安的睡梦中醒来。',
  chapter: { id: 'c2', number: 2, title: 'The Metamorphosis' },
}

function signIn(userId: string | null) {
  vi.mocked(auth).mockResolvedValueOnce({ userId } as AuthResult)
}

async function ownerSearch(q: string | null) {
  const { GET } = await import('@/app/api/projects/[id]/search/route')
  const qs = q === null ? '' : `?q=${encodeURIComponent(q)}`
  return GET(new NextRequest(`http://localhost:3000/api/projects/p1/search${qs}`), {
    params: Promise.resolve({ id: 'p1' }),
  })
}

async function publicSearch(token: string, q: string) {
  const { GET } = await import('@/app/api/read/[token]/search/route')
  return GET(
    new NextRequest(`http://localhost:3000/api/read/${token}/search?q=${encodeURIComponent(q)}`),
    { params: Promise.resolve({ token }) }
  )
}

describe('GET /api/projects/[id]/search', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    signIn(null)
    expect((await ownerSearch('Gregor')).status).toBe(401)
    expect(mockSegmentFindMany).not.toHaveBeenCalled()
  })

  it('returns 400 for a missing, too short or too long query', async () => {
    for (const q of [null, 'a', ' a ', 'x'.repeat(101)]) {
      signIn('user_abc')
      expect((await ownerSearch(q)).status).toBe(400)
    }
    expect(mockSegmentFindMany).not.toHaveBeenCalled()
  })

  it("returns 403 for someone else's project", async () => {
    signIn('user_other')
    mockProjectFindUnique.mockResolvedValueOnce({ id: 'p1', ownerId: 'user_abc' })
    expect((await ownerSearch('Gregor')).status).toBe(403)
    expect(mockSegmentFindMany).not.toHaveBeenCalled()
  })

  it('searches only this project, case-insensitively, with a result cap', async () => {
    signIn('user_abc')
    mockProjectFindUnique.mockResolvedValueOnce({ id: 'p1', ownerId: 'user_abc' })
    mockSegmentFindMany.mockResolvedValueOnce([])
    await ownerSearch('  Gregor ')
    const [args] = mockSegmentFindMany.mock.calls[0]
    expect(args.where.chapter).toEqual({ projectId: 'p1' })
    expect(args.where.OR).toEqual([
      { source: { contains: 'Gregor', mode: 'insensitive' } },
      { translation: { contains: 'Gregor', mode: 'insensitive' } },
    ])
    expect(args.take).toBeLessThanOrEqual(50)
  })

  it('returns hits with chapter, paragraph index and a snippet', async () => {
    signIn('user_abc')
    mockProjectFindUnique.mockResolvedValueOnce({ id: 'p1', ownerId: 'user_abc' })
    mockSegmentFindMany.mockResolvedValueOnce([hit])
    const res = await ownerSearch('gregor')
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data).toHaveLength(1)
    expect(data[0]).toMatchObject({
      chapterId: 'c2',
      chapterNumber: 2,
      chapterTitle: 'The Metamorphosis',
      index: 4,
    })
    expect(data[0].snippet).toContain('Gregor')
  })

  it('takes the snippet from the translation when only the translation matches', async () => {
    signIn('user_abc')
    mockProjectFindUnique.mockResolvedValueOnce({ id: 'p1', ownerId: 'user_abc' })
    mockSegmentFindMany.mockResolvedValueOnce([hit])
    const { data } = await (await ownerSearch('格里高尔')).json()
    expect(data[0].snippet).toContain('格里高尔')
  })
})

describe('GET /api/read/[token]/search', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 400 for a malformed token before touching the database', async () => {
    const res = await publicSearch('not-a-uuid', 'Gregor')
    expect(res.status).toBe(400)
    expect(mockProjectFindFirst).not.toHaveBeenCalled()
  })

  it('returns 404 for an unknown or unpublished token', async () => {
    mockProjectFindFirst.mockResolvedValueOnce(null)
    const res = await publicSearch(TOKEN, 'Gregor')
    expect(res.status).toBe(404)
    expect(mockSegmentFindMany).not.toHaveBeenCalled()
  })

  it("searches only the published project's segments", async () => {
    mockProjectFindFirst.mockResolvedValueOnce({ id: 'p9' })
    mockSegmentFindMany.mockResolvedValueOnce([hit])
    const res = await publicSearch(TOKEN, 'Gregor')
    expect(res.status).toBe(200)
    const [args] = mockSegmentFindMany.mock.calls[0]
    expect(args.where.chapter).toEqual({ projectId: 'p9' })
    const { data } = await res.json()
    expect(data[0].chapterId).toBe('c2')
  })
})
