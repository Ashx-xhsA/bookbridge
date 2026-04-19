/**
 * Failing (red) tests for issue #32 — GET /api/read/[token]/chunks/[chunkId]
 *
 * This route is intentionally unauthenticated — the publicToken IS the
 * authorization. The chunkId scopes the response to a single chapter's content.
 *
 * Required test cases:
 *   - Valid token + valid chunk belonging to that project → 200 with originalText + translatedText
 *   - Invalid/unpublished token → 404
 *   - Chunk that does not belong to that token's project → 404 (prevent cross-project access)
 *   - Unknown chunkId → 404
 *
 * Security assertions:
 *   - Cross-project chunk access must be blocked (OWASP A01 — prevent IDOR)
 *   - 404 body shape must not disclose whether project or chunk exists
 *
 * All tests fail with "Cannot find module" because the route does not exist.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// No Clerk mock — these routes intentionally skip auth()

const mockProjectFindFirst = vi.fn()
const mockChapterFindUnique = vi.fn()

vi.mock('@/lib/prisma', () => ({
  default: {
    project: {
      findFirst: (...args: unknown[]) => mockProjectFindFirst(...args),
    },
    chapter: {
      findUnique: (...args: unknown[]) => mockChapterFindUnique(...args),
    },
  },
}))

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------
const VALID_TOKEN = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const INVALID_TOKEN = 'zzzzzzzz-0000-4000-a000-000000000000'
const PROJECT_ID = 'clh3p7b1p0001qzrmkf8g4m0i'
const OTHER_PROJECT_ID = 'clh3p7b1p0001qzrmkf8g4m0j'
const CHUNK_ID = 'clh4c1a2b0002qzrmkf8g4n1j'
const UNKNOWN_CHUNK_ID = 'clhXXXXXXXXXXXXXXXXXXXXXX'

const publishedProject = {
  id: PROJECT_ID,
  title: 'My Translated Novel',
  sourceLang: 'en',
  targetLang: 'zh-Hans',
  status: 'COMPLETED',
  isPublic: true,
  publicToken: VALID_TOKEN,
}

const fakeChapter = {
  id: CHUNK_ID,
  projectId: PROJECT_ID,
  number: 1,
  title: 'Chapter One',
  startPage: 1,
  endPage: 20,
  pageCount: 20,
  sourceContent: 'It was the best of times, it was the worst of times.',
  translation: '这是最好的时代，这是最坏的时代。',
}

// A chapter that belongs to a DIFFERENT project (cross-project IDOR scenario)
const chapterFromOtherProject = {
  ...fakeChapter,
  id: CHUNK_ID,
  projectId: OTHER_PROJECT_ID,
}

// ---------------------------------------------------------------------------
// Request factory helpers
// ---------------------------------------------------------------------------
function makeGetRequest(token: string, chunkId: string): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/read/${token}/chunks/${chunkId}`,
    { method: 'GET' },
  )
}

function makeParams(token: string, chunkId: string) {
  return { params: Promise.resolve({ token, chunkId }) }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------
describe('GET /api/read/[token]/chunks/[chunkId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  // Happy path — valid published token + chunk belonging to that project → 200
  // Response must include originalText + translatedText (reading view fields).
  it('returns 200 with originalText and translatedText for a valid token and chunk', async () => {
    mockProjectFindFirst.mockResolvedValueOnce(publishedProject)
    mockChapterFindUnique.mockResolvedValueOnce(fakeChapter)
    const { GET } = await import('@/app/api/read/[token]/chunks/[chunkId]/route')
    const res = await GET(
      makeGetRequest(VALID_TOKEN, CHUNK_ID),
      makeParams(VALID_TOKEN, CHUNK_ID),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toBeDefined()
    // Response must expose reading-view field names (not raw DB column names)
    expect(body.data.originalText).toBe(fakeChapter.sourceContent)
    expect(body.data.translatedText).toBe(fakeChapter.translation)
    // Must NOT expose internal fields
    expect(body.data.projectId).toBeUndefined()
  })

  // Edge case — invalid/unknown token → 404 (no project found)
  // Must not reveal whether the project exists (OWASP A01 enumeration prevention).
  it('returns 404 when the token is unknown (no published project found)', async () => {
    mockProjectFindFirst.mockResolvedValueOnce(null)
    const { GET } = await import('@/app/api/read/[token]/chunks/[chunkId]/route')
    const res = await GET(
      makeGetRequest(INVALID_TOKEN, CHUNK_ID),
      makeParams(INVALID_TOKEN, CHUNK_ID),
    )
    expect(res.status).toBe(404)
    // Must not be 401 or 403 — token-as-auth pattern
    expect(res.status).not.toBe(401)
    expect(res.status).not.toBe(403)
  })

  // Edge case — unpublished project token → 404
  // findFirst with isPublic=true filter returns null for unpublished projects.
  it('returns 404 when the token matches a project that is not published', async () => {
    // Route queries WHERE publicToken=token AND isPublic=true → returns null
    mockProjectFindFirst.mockResolvedValueOnce(null)
    const { GET } = await import('@/app/api/read/[token]/chunks/[chunkId]/route')
    const res = await GET(
      makeGetRequest(VALID_TOKEN, CHUNK_ID),
      makeParams(VALID_TOKEN, CHUNK_ID),
    )
    expect(res.status).toBe(404)
  })

  // Security — cross-project chunk access must be blocked (OWASP A01 — IDOR)
  // Attacker uses a valid token for project A but supplies a chunkId from project B.
  // The route must verify chunk.projectId === project.id before returning data.
  it('returns 404 when the chunk belongs to a different project (cross-project IDOR attempt)', async () => {
    mockProjectFindFirst.mockResolvedValueOnce(publishedProject) // project A
    mockChapterFindUnique.mockResolvedValueOnce(chapterFromOtherProject) // chunk from project B
    const { GET } = await import('@/app/api/read/[token]/chunks/[chunkId]/route')
    const res = await GET(
      makeGetRequest(VALID_TOKEN, CHUNK_ID),
      makeParams(VALID_TOKEN, CHUNK_ID),
    )
    // Must be 404, not 200 — the chunk does not belong to the token's project
    expect(res.status).toBe(404)
  })

  // Edge case — unknown chunkId (chapter not found in DB) → 404
  // Even with a valid token, a non-existent chunkId must return 404.
  it('returns 404 when the chunkId does not exist in the database', async () => {
    mockProjectFindFirst.mockResolvedValueOnce(publishedProject)
    mockChapterFindUnique.mockResolvedValueOnce(null)
    const { GET } = await import('@/app/api/read/[token]/chunks/[chunkId]/route')
    const res = await GET(
      makeGetRequest(VALID_TOKEN, UNKNOWN_CHUNK_ID),
      makeParams(VALID_TOKEN, UNKNOWN_CHUNK_ID),
    )
    expect(res.status).toBe(404)
  })

  // Input validation — empty token must be rejected with 400 before hitting Prisma
  // (OWASP A03 — validate all inputs with Zod)
  it('returns 400 when the token path param is an empty string', async () => {
    const { GET } = await import('@/app/api/read/[token]/chunks/[chunkId]/route')
    const res = await GET(
      makeGetRequest('', CHUNK_ID),
      makeParams('', CHUNK_ID),
    )
    expect(res.status).toBe(400)
    expect(mockProjectFindFirst).not.toHaveBeenCalled()
  })

  // Input validation — empty chunkId must be rejected with 400 before hitting Prisma
  // (OWASP A03 — validate all inputs with Zod)
  it('returns 400 when the chunkId path param is an empty string', async () => {
    const { GET } = await import('@/app/api/read/[token]/chunks/[chunkId]/route')
    const res = await GET(
      makeGetRequest(VALID_TOKEN, ''),
      makeParams(VALID_TOKEN, ''),
    )
    expect(res.status).toBe(400)
    expect(mockProjectFindFirst).not.toHaveBeenCalled()
  })

  // Edge case — chunk with null translatedText must still return 200 (translation in progress)
  // originalText is always present; translatedText may be null for untranslated chapters.
  it('returns 200 with translatedText as null when chapter has no translation yet', async () => {
    const untranslatedChapter = { ...fakeChapter, translation: null }
    mockProjectFindFirst.mockResolvedValueOnce(publishedProject)
    mockChapterFindUnique.mockResolvedValueOnce(untranslatedChapter)
    const { GET } = await import('@/app/api/read/[token]/chunks/[chunkId]/route')
    const res = await GET(
      makeGetRequest(VALID_TOKEN, CHUNK_ID),
      makeParams(VALID_TOKEN, CHUNK_ID),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.originalText).toBe(fakeChapter.sourceContent)
    expect(body.data.translatedText).toBeNull()
  })
})
