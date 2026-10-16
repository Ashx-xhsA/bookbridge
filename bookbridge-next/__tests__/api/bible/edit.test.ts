/**
 * Phase 3b review APIs:
 * - PATCH /api/projects/[id]/bible — edit style guide, confirm / reopen
 * - PATCH /api/projects/[id]/glossary/[termId] — gender, voice, alias link
 * - POST  /api/projects/[id]/glossary — create a term, optionally as an alias
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))

const mockProjectFindUnique = vi.fn()
const mockBibleFindUnique = vi.fn()
const mockBibleUpdate = vi.fn()
const mockTermFindUnique = vi.fn()
const mockTermUpdate = vi.fn()
const mockTermCreate = vi.fn()
const mockTermCount = vi.fn()

vi.mock('@/lib/prisma', () => ({
  default: {
    project: { findUnique: (...a: unknown[]) => mockProjectFindUnique(...a) },
    bookBible: {
      findUnique: (...a: unknown[]) => mockBibleFindUnique(...a),
      update: (...a: unknown[]) => mockBibleUpdate(...a),
    },
    glossaryTerm: {
      findUnique: (...a: unknown[]) => mockTermFindUnique(...a),
      update: (...a: unknown[]) => mockTermUpdate(...a),
      create: (...a: unknown[]) => mockTermCreate(...a),
      count: (...a: unknown[]) => mockTermCount(...a),
    },
  },
}))

import { auth } from '@clerk/nextjs/server'
type AuthReturn = Awaited<ReturnType<typeof auth>>

const PROJECT_ID = 'clh3p7b1p0001qzrmkf8g4m0i'
const TERM_ID = 'clh3p7b1p0005qzrmkf8g4m0t'
const MAIN_ID = 'clh3p7b1p0006qzrmkf8g4m0m'
const OWNER = 'user_owner'

function signedIn(userId: string | null = OWNER) {
  vi.mocked(auth).mockResolvedValueOnce({ userId } as AuthReturn)
}

function json(method: string, body: unknown) {
  return new NextRequest('http://localhost/x', {
    method,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const bibleParams = { params: Promise.resolve({ id: PROJECT_ID }) }
const termParams = { params: Promise.resolve({ id: PROJECT_ID, termId: TERM_ID }) }

const term = (overrides: Record<string, unknown> = {}) => ({
  id: TERM_ID,
  projectId: PROJECT_ID,
  english: 'Mithrandir',
  aliasOfId: null,
  ...overrides,
})
const main = (overrides: Record<string, unknown> = {}) => ({
  id: MAIN_ID,
  projectId: PROJECT_ID,
  english: 'Gandalf',
  aliasOfId: null,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  mockProjectFindUnique.mockResolvedValue({ id: PROJECT_ID, ownerId: OWNER })
  mockBibleFindUnique.mockResolvedValue({ status: 'DRAFT' })
  mockBibleUpdate.mockImplementation(async ({ data }) => ({ status: 'DRAFT', styleGuide: '', ...data }))
  mockTermUpdate.mockImplementation(async ({ data }) => ({ ...term(), ...data }))
  mockTermCreate.mockImplementation(async ({ data }) => ({ id: 'new', ...data }))
  mockTermCount.mockResolvedValue(0)
})

describe('PATCH /api/projects/[id]/bible', () => {
  it('returns 401 / 403 for signed-out and non-owners', async () => {
    const { PATCH } = await import('@/app/api/projects/[id]/bible/route')
    signedIn(null)
    expect((await PATCH(json('PATCH', { status: 'CONFIRMED' }), bibleParams)).status).toBe(401)
    signedIn('user_other')
    expect((await PATCH(json('PATCH', { status: 'CONFIRMED' }), bibleParams)).status).toBe(403)
    expect(mockBibleUpdate).not.toHaveBeenCalled()
  })

  it.each([{ status: 'SCANNING' }, { styleGuide: 'x'.repeat(5001) }, {}])(
    'returns 400 for %o',
    async (body) => {
      signedIn()
      const { PATCH } = await import('@/app/api/projects/[id]/bible/route')
      expect((await PATCH(json('PATCH', body), bibleParams)).status).toBe(400)
    }
  )

  it('returns 404 before any scan', async () => {
    signedIn()
    mockBibleFindUnique.mockResolvedValueOnce(null)
    const { PATCH } = await import('@/app/api/projects/[id]/bible/route')
    expect((await PATCH(json('PATCH', { status: 'CONFIRMED' }), bibleParams)).status).toBe(404)
  })

  it.each(['SCANNING', 'FAILED'])('returns 409 when the bible is %s', async (status) => {
    signedIn()
    mockBibleFindUnique.mockResolvedValueOnce({ status })
    const { PATCH } = await import('@/app/api/projects/[id]/bible/route')
    expect((await PATCH(json('PATCH', { status: 'CONFIRMED' }), bibleParams)).status).toBe(409)
  })

  it('saves the style guide and confirms', async () => {
    signedIn()
    const { PATCH } = await import('@/app/api/projects/[id]/bible/route')
    const res = await PATCH(json('PATCH', { styleGuide: '- 简洁', status: 'CONFIRMED' }), bibleParams)
    expect(res.status).toBe(200)
    expect(mockBibleUpdate).toHaveBeenCalledWith({
      where: { projectId: PROJECT_ID },
      data: { styleGuide: '- 简洁', status: 'CONFIRMED' },
      select: { status: true, styleGuide: true },
    })
    expect((await res.json()).bible.status).toBe('CONFIRMED')
  })
})

describe('PATCH /api/projects/[id]/glossary/[termId] — bible fields', () => {
  it('sets gender and voice and marks the term user-edited', async () => {
    signedIn()
    mockTermFindUnique.mockResolvedValueOnce(term())
    const { PATCH } = await import('@/app/api/projects/[id]/glossary/[termId]/route')
    const res = await PATCH(json('PATCH', { gender: 'female', voice: '温和。' }), termParams)
    expect(res.status).toBe(200)
    expect(mockTermUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { gender: 'female', voice: '温和。', userEdited: true },
      })
    )
  })

  it('clears voice with null', async () => {
    signedIn()
    mockTermFindUnique.mockResolvedValueOnce(term())
    const { PATCH } = await import('@/app/api/projects/[id]/glossary/[termId]/route')
    await PATCH(json('PATCH', { voice: null }), termParams)
    expect(mockTermUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { voice: null, userEdited: true } })
    )
  })

  it('rejects an unknown gender', async () => {
    signedIn()
    const { PATCH } = await import('@/app/api/projects/[id]/glossary/[termId]/route')
    expect((await PATCH(json('PATCH', { gender: 'robot' }), termParams)).status).toBe(400)
  })

  it('links the term as an alias of a main term in the same project', async () => {
    signedIn()
    mockTermFindUnique.mockResolvedValueOnce(term()).mockResolvedValueOnce(main())
    const { PATCH } = await import('@/app/api/projects/[id]/glossary/[termId]/route')
    const res = await PATCH(json('PATCH', { aliasOfId: MAIN_ID }), termParams)
    expect(res.status).toBe(200)
    expect(mockTermUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { aliasOfId: MAIN_ID } })
    )
  })

  it('unlinks with aliasOfId null', async () => {
    signedIn()
    mockTermFindUnique.mockResolvedValueOnce(term({ aliasOfId: MAIN_ID }))
    const { PATCH } = await import('@/app/api/projects/[id]/glossary/[termId]/route')
    await PATCH(json('PATCH', { aliasOfId: null }), termParams)
    expect(mockTermUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { aliasOfId: null } }))
  })

  it.each([
    ['target missing', null, 0],
    ['target in another project', main({ projectId: 'clh3p7b1p0009qzrmkf8g4zzz' }), 0],
    ['target is itself an alias', main({ aliasOfId: 'clh3p7b1p0007qzrmkf8g4m0x' }), 0],
    ['term already has aliases', main(), 2],
  ])('rejects an alias link when %s', async (_why, target, ownAliases) => {
    signedIn()
    mockTermFindUnique.mockResolvedValueOnce(term()).mockResolvedValueOnce(target)
    mockTermCount.mockResolvedValueOnce(ownAliases)
    const { PATCH } = await import('@/app/api/projects/[id]/glossary/[termId]/route')
    expect((await PATCH(json('PATCH', { aliasOfId: MAIN_ID }), termParams)).status).toBe(400)
    expect(mockTermUpdate).not.toHaveBeenCalled()
  })

  it('rejects linking a term to itself', async () => {
    signedIn()
    mockTermFindUnique.mockResolvedValueOnce(term())
    const { PATCH } = await import('@/app/api/projects/[id]/glossary/[termId]/route')
    expect((await PATCH(json('PATCH', { aliasOfId: TERM_ID }), termParams)).status).toBe(400)
  })
})

describe('POST /api/projects/[id]/glossary — aliases', () => {
  it('creates an alias row with its own translation, marked user-edited', async () => {
    signedIn()
    mockTermFindUnique.mockResolvedValueOnce(main())
    const { POST } = await import('@/app/api/projects/[id]/glossary/route')
    const res = await POST(
      json('POST', {
        english: 'Mithrandir',
        translation: '米斯兰达',
        category: 'person',
        aliasOfId: MAIN_ID,
      }),
      bibleParams
    )
    expect(res.status).toBe(201)
    expect(mockTermCreate).toHaveBeenCalledWith({
      data: {
        projectId: PROJECT_ID,
        english: 'Mithrandir',
        translation: '米斯兰达',
        category: 'person',
        aliasOfId: MAIN_ID,
        userEdited: true,
      },
    })
  })

  it('rejects an alias of a term that is itself an alias', async () => {
    signedIn()
    mockTermFindUnique.mockResolvedValueOnce(main({ aliasOfId: 'clh3p7b1p0007qzrmkf8g4m0x' }))
    const { POST } = await import('@/app/api/projects/[id]/glossary/route')
    const res = await POST(json('POST', { english: 'X', translation: 'x', aliasOfId: MAIN_ID }), bibleParams)
    expect(res.status).toBe(400)
    expect(mockTermCreate).not.toHaveBeenCalled()
  })

  it.each([{ english: '' }, { english: 'x'.repeat(201) }, { english: 'A', category: 'x'.repeat(51) }])(
    'validates the body %#',
    async (body) => {
      signedIn()
      const { POST } = await import('@/app/api/projects/[id]/glossary/route')
      expect((await POST(json('POST', body), bibleParams)).status).toBe(400)
    }
  )
})
