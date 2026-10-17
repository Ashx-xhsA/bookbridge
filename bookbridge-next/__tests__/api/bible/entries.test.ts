/**
 * Phase 5c — GET /api/projects/[id]/bible/entries: one page of bible
 * entries (characters, or places and terms), optionally filtered by name.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))

const mockProjectFindUnique = vi.fn()
const mockTermFindMany = vi.fn()
const mockTermCount = vi.fn()

vi.mock('@/lib/prisma', () => ({
  default: {
    project: { findUnique: (...a: unknown[]) => mockProjectFindUnique(...a) },
    glossaryTerm: {
      findMany: (...a: unknown[]) => mockTermFindMany(...a),
      count: (...a: unknown[]) => mockTermCount(...a),
    },
  },
}))

import { auth } from '@clerk/nextjs/server'
type AuthReturn = Awaited<ReturnType<typeof auth>>

const PROJECT_ID = 'p1'

function term(id: string) {
  return { id, english: `Name ${id}`, translation: null, category: 'person', gender: null,
    voice: null, mentions: 1, approved: false, userEdited: false, aliases: [] }
}

function signIn(userId: string | null) {
  vi.mocked(auth).mockResolvedValueOnce({ userId } as AuthReturn)
}

function owner() {
  signIn('user_abc')
  mockProjectFindUnique.mockResolvedValueOnce({ id: PROJECT_ID, ownerId: 'user_abc' })
}

async function get(query: string) {
  const { GET } = await import('@/app/api/projects/[id]/bible/entries/route')
  return GET(new NextRequest(`http://localhost:3000/api/projects/${PROJECT_ID}/bible/entries?${query}`), {
    params: Promise.resolve({ id: PROJECT_ID }),
  })
}

describe('GET /api/projects/[id]/bible/entries', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    signIn(null)
    expect((await get('group=person')).status).toBe(401)
  })

  it("returns 403 for someone else's project", async () => {
    signIn('user_other')
    mockProjectFindUnique.mockResolvedValueOnce({ id: PROJECT_ID, ownerId: 'user_abc' })
    expect((await get('group=person')).status).toBe(403)
    expect(mockTermFindMany).not.toHaveBeenCalled()
  })

  it('rejects a bad group, cursor or query', async () => {
    for (const q of ['group=nope', '', `group=person&cursor=${'x'.repeat(200)}`, `group=other&q=${'x'.repeat(101)}`]) {
      signIn('user_abc')
      expect((await get(q)).status).toBe(400)
    }
    expect(mockTermFindMany).not.toHaveBeenCalled()
  })

  it('pages main entries of one group by mentions, with a stable order', async () => {
    owner()
    mockTermFindMany.mockResolvedValueOnce([])
    mockTermCount.mockResolvedValueOnce(0)
    await get('group=person')
    const [args] = mockTermFindMany.mock.calls[0]
    expect(args.where).toEqual({ projectId: PROJECT_ID, aliasOfId: null, category: 'person' })
    expect(args.orderBy).toEqual([{ mentions: 'desc' }, { english: 'asc' }, { id: 'asc' }])
    expect(args.take).toBe(51)
    expect(args.cursor).toBeUndefined()
    expect(mockTermCount.mock.calls[0][0].where).toEqual(args.where)
  })

  it('treats every non-person category as the other group', async () => {
    owner()
    mockTermFindMany.mockResolvedValueOnce([])
    mockTermCount.mockResolvedValueOnce(0)
    await get('group=other')
    expect(mockTermFindMany.mock.calls[0][0].where.category).toEqual({ not: 'person' })
  })

  it('filters by name, translation or alias name', async () => {
    owner()
    mockTermFindMany.mockResolvedValueOnce([])
    mockTermCount.mockResolvedValueOnce(0)
    await get('group=person&q=%20mithr%20')
    expect(mockTermFindMany.mock.calls[0][0].where.OR).toEqual([
      { english: { contains: 'mithr', mode: 'insensitive' } },
      { translation: { contains: 'mithr', mode: 'insensitive' } },
      { aliases: { some: { english: { contains: 'mithr', mode: 'insensitive' } } } },
    ])
  })

  it('continues after a cursor and reports the next one when more remain', async () => {
    owner()
    const rows = Array.from({ length: 51 }, (_, i) => term(`t${i}`))
    mockTermFindMany.mockResolvedValueOnce(rows)
    mockTermCount.mockResolvedValueOnce(120)
    const res = await get('group=person&cursor=t_prev')
    const [args] = mockTermFindMany.mock.calls[0]
    expect(args.cursor).toEqual({ id: 't_prev' })
    expect(args.skip).toBe(1)
    const body = await res.json()
    expect(body.data).toHaveLength(50)
    expect(body.total).toBe(120)
    expect(body.nextCursor).toBe('t49')
  })

  it('returns no next cursor on the last page', async () => {
    owner()
    mockTermFindMany.mockResolvedValueOnce([term('a'), term('b')])
    mockTermCount.mockResolvedValueOnce(2)
    const body = await (await get('group=person')).json()
    expect(body.data).toHaveLength(2)
    expect(body.nextCursor).toBeNull()
  })
})
