/**
 * Failing (red) tests for issue #30 — POST /api/internal/worker-callback/glossary
 *
 * After each chunk translation the Python Worker POSTs newly extracted terms
 * to this endpoint (server-to-server, authenticated via WORKER_CALLBACK_SECRET).
 * The route upserts GlossaryTerm rows with merge rule: exists → skip.
 *
 * These tests MUST fail until the route is implemented.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Mock Prisma singleton
//
// The route uses upsert (or findUnique + createMany) per term. We mock the
// operations most likely used — upsertMany or a loop of upsert calls — with
// a catch-all via findMany + createMany pattern since Prisma lacks upsertMany.
// ---------------------------------------------------------------------------
const mockProjectFindUnique = vi.fn()
const mockTermFindMany = vi.fn()
const mockTermCreateMany = vi.fn()
const mockTermUpsert = vi.fn()

vi.mock('@/lib/prisma', () => ({
  default: {
    project: {
      findUnique: (...args: unknown[]) => mockProjectFindUnique(...args),
    },
    glossaryTerm: {
      findMany: (...args: unknown[]) => mockTermFindMany(...args),
      createMany: (...args: unknown[]) => mockTermCreateMany(...args),
      upsert: (...args: unknown[]) => mockTermUpsert(...args),
    },
  },
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const SECRET = 'test-glossary-secret'
const PROJECT_ID = 'proj-abc'

const VALID_TERMS = [
  { english: 'Hermione', translation: '赫敏', category: 'person' },
  { english: 'wand', translation: '魔杖', category: 'technical' },
]

function makeRequest(
  body: Record<string, unknown>,
  headers: Record<string, string> = {}
): NextRequest {
  return new NextRequest(
    'http://localhost:3000/api/internal/worker-callback/glossary',
    {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json', ...headers },
    }
  )
}

function withSecret(extra: Record<string, string> = {}): Record<string, string> {
  return { 'X-Worker-Secret': SECRET, ...extra }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('POST /api/internal/worker-callback/glossary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    process.env.WORKER_CALLBACK_SECRET = SECRET
    // Default: project exists. Individual tests override with
    // mockResolvedValueOnce when asserting the 404-not-found branch.
    mockProjectFindUnique.mockResolvedValue({ id: PROJECT_ID })
  })

  // -------------------------------------------------------------------------
  // Auth guard (server-to-server shared secret)
  // -------------------------------------------------------------------------
  it('returns 401 when X-Worker-Secret header is missing', async () => {
    const { POST } = await import(
      '@/app/api/internal/worker-callback/glossary/route'
    )
    const res = await POST(
      makeRequest({ projectId: PROJECT_ID, terms: VALID_TERMS })
    )
    expect(res.status).toBe(401)
    expect(mockTermCreateMany).not.toHaveBeenCalled()
    expect(mockTermUpsert).not.toHaveBeenCalled()
  })

  it('returns 401 when X-Worker-Secret does not match env secret', async () => {
    const { POST } = await import(
      '@/app/api/internal/worker-callback/glossary/route'
    )
    const res = await POST(
      makeRequest(
        { projectId: PROJECT_ID, terms: VALID_TERMS },
        { 'X-Worker-Secret': 'wrong-secret' }
      )
    )
    expect(res.status).toBe(401)
    expect(mockTermCreateMany).not.toHaveBeenCalled()
    expect(mockTermUpsert).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Input validation
  // -------------------------------------------------------------------------
  it('returns 400 when projectId is missing from body', async () => {
    const { POST } = await import(
      '@/app/api/internal/worker-callback/glossary/route'
    )
    const res = await POST(
      makeRequest({ terms: VALID_TERMS }, withSecret())
    )
    expect(res.status).toBe(400)
    expect(mockTermCreateMany).not.toHaveBeenCalled()
    expect(mockTermUpsert).not.toHaveBeenCalled()
  })

  it('returns 400 when terms array is missing from body', async () => {
    const { POST } = await import(
      '@/app/api/internal/worker-callback/glossary/route'
    )
    const res = await POST(
      makeRequest({ projectId: PROJECT_ID }, withSecret())
    )
    expect(res.status).toBe(400)
    expect(mockTermCreateMany).not.toHaveBeenCalled()
    expect(mockTermUpsert).not.toHaveBeenCalled()
  })

  it('returns 400 when a term is missing the english field', async () => {
    const { POST } = await import(
      '@/app/api/internal/worker-callback/glossary/route'
    )
    const badTerms = [{ translation: '赫敏', category: 'person' }]
    const res = await POST(
      makeRequest({ projectId: PROJECT_ID, terms: badTerms }, withSecret())
    )
    expect(res.status).toBe(400)
  })

  // -------------------------------------------------------------------------
  // Project existence guard (prevents fk-violation 500s)
  // -------------------------------------------------------------------------
  it('returns 404 when projectId does not match any existing project', async () => {
    mockProjectFindUnique.mockReset()
    mockProjectFindUnique.mockResolvedValueOnce(null)

    const { POST } = await import(
      '@/app/api/internal/worker-callback/glossary/route'
    )
    const res = await POST(
      makeRequest({ projectId: PROJECT_ID, terms: VALID_TERMS }, withSecret())
    )
    expect(res.status).toBe(404)
    expect(mockTermFindMany).not.toHaveBeenCalled()
    expect(mockTermCreateMany).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Happy path — all new terms
  // -------------------------------------------------------------------------
  it('upserts all terms with approved:false and userEdited:false when all are new', async () => {
    // No existing terms in the DB for this project
    mockTermFindMany.mockResolvedValueOnce([])
    mockTermCreateMany.mockResolvedValueOnce({ count: 2 })

    const { POST } = await import(
      '@/app/api/internal/worker-callback/glossary/route'
    )
    const res = await POST(
      makeRequest({ projectId: PROJECT_ID, terms: VALID_TERMS }, withSecret())
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    // Must report how many rows were inserted
    expect(body.inserted).toBe(2)
    expect(body.skipped).toBe(0)
  })

  // -------------------------------------------------------------------------
  // Edge — all terms already exist (merge rule: exists → skip)
  // -------------------------------------------------------------------------
  it('skips all terms and leaves existing rows untouched when all already exist', async () => {
    // Existing rows have same (projectId + lower(english))
    mockTermFindMany.mockResolvedValueOnce([
      {
        id: 't1',
        projectId: PROJECT_ID,
        english: 'Hermione',
        approved: true,
        userEdited: true,
      },
      {
        id: 't2',
        projectId: PROJECT_ID,
        english: 'wand',
        approved: false,
        userEdited: false,
      },
    ])

    const { POST } = await import(
      '@/app/api/internal/worker-callback/glossary/route'
    )
    const res = await POST(
      makeRequest({ projectId: PROJECT_ID, terms: VALID_TERMS }, withSecret())
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.inserted).toBe(0)
    expect(body.skipped).toBe(2)
    // Must NOT have called any write — existing rows are untouched
    expect(mockTermCreateMany).not.toHaveBeenCalled()
    expect(mockTermUpsert).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Edge — mixed batch (2 new + 1 existing)
  // -------------------------------------------------------------------------
  it('inserts only new terms and skips existing ones in a mixed batch', async () => {
    const mixedTerms = [
      { english: 'Hermione', translation: '赫敏', category: 'person' }, // exists
      { english: 'Hogwarts', translation: '霍格沃茨', category: 'place' }, // new
      { english: 'broomstick', translation: '飞天扫帚', category: 'technical' }, // new
    ]
    // Only Hermione already exists
    mockTermFindMany.mockResolvedValueOnce([
      { id: 't1', projectId: PROJECT_ID, english: 'Hermione' },
    ])
    mockTermCreateMany.mockResolvedValueOnce({ count: 2 })

    const { POST } = await import(
      '@/app/api/internal/worker-callback/glossary/route'
    )
    const res = await POST(
      makeRequest({ projectId: PROJECT_ID, terms: mixedTerms }, withSecret())
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.inserted).toBe(2)
    expect(body.skipped).toBe(1)
  })
})
