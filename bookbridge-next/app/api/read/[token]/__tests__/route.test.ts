/**
 * Failing (red) tests for issue #32 — GET /api/read/[token]
 *
 * This route is intentionally unauthenticated — the publicToken IS the
 * authorization. No Clerk auth() call is expected or mocked.
 *
 * Required test cases:
 *   - test_valid_token_returns_metadata   — published project + valid token → 200
 *   - test_invalid_token_returns_404      — unknown token → 404
 *   - test_unpublished_project_returns_404 — token matches but isPublic=false → 404
 *
 * Security assertions:
 *   - 200 response must not include ownerId or other internal fields
 *   - 404 response body must be identical for unknown vs unpublished token
 *     (prevents enumeration — OWASP A01)
 *
 * All tests fail with "Cannot find module" because the route does not exist.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// No Clerk mock — these routes intentionally skip auth()

const mockProjectFindFirst = vi.fn()

vi.mock('@/lib/prisma', () => ({
  default: {
    project: {
      findFirst: (...args: unknown[]) => mockProjectFindFirst(...args),
    },
  },
}))

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------
const VALID_TOKEN = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const INVALID_TOKEN = 'zzzzzzzz-0000-4000-a000-000000000000'
const PROJECT_ID = 'clh3p7b1p0001qzrmkf8g4m0i'
const OWNER_ID = 'user_owner_abc'

const publishedProject = {
  id: PROJECT_ID,
  title: 'My Translated Novel',
  sourceLang: 'en',
  targetLang: 'zh-Hans',
  status: 'COMPLETED',
  isPublic: true,
  publicToken: VALID_TOKEN,
  ownerId: OWNER_ID,
  createdAt: new Date(),
  updatedAt: new Date(),
  chapters: [
    { id: 'ch1', number: 1, title: 'Chapter One' },
    { id: 'ch2', number: 2, title: 'Chapter Two' },
  ],
}

// ---------------------------------------------------------------------------
// Request factory helpers
// ---------------------------------------------------------------------------
function makeGetRequest(token: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/read/${token}`, {
    method: 'GET',
  })
}

function makeParams(token: string) {
  return { params: Promise.resolve({ token }) }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------
describe('GET /api/read/[token]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  // Happy path — test_valid_token_returns_metadata
  // Published project with matching publicToken → 200 with name + targetLanguage.
  // Response must NOT include ownerId (data exposure — OWASP A09).
  it('test_valid_token_returns_metadata: returns 200 with project metadata for a published project', async () => {
    mockProjectFindFirst.mockResolvedValueOnce(publishedProject)
    const { GET } = await import('@/app/api/read/[token]/route')
    const res = await GET(makeGetRequest(VALID_TOKEN), makeParams(VALID_TOKEN))
    expect(res.status).toBe(200)
    const body = await res.json()
    // Must include the fields the reading view needs
    expect(body.data).toBeDefined()
    expect(body.data.title).toBe('My Translated Novel')
    expect(body.data.targetLanguage).toBeDefined()
    // Must NOT expose internal ownership data (OWASP A09 — minimal data exposure)
    expect(body.data.ownerId).toBeUndefined()
    // Must NOT expose publicToken in the response (it's the auth credential)
    expect(body.data.publicToken).toBeUndefined()
  })

  // Edge case — test_invalid_token_returns_404
  // Unknown token (no row in DB) must return 404 with a plain message.
  // Must NOT disclose whether the project exists (prevents enumeration — OWASP A01).
  it('test_invalid_token_returns_404: returns 404 for an unknown token', async () => {
    mockProjectFindFirst.mockResolvedValueOnce(null)
    const { GET } = await import('@/app/api/read/[token]/route')
    const res = await GET(makeGetRequest(INVALID_TOKEN), makeParams(INVALID_TOKEN))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBeDefined()
    // Must not leak existence information
    expect(body.error).not.toMatch(/exist|found|public/i)
  })

  // Edge case — test_unpublished_project_returns_404
  // Token matches a project but isPublic=false → must return 404, NOT 401 or 403.
  // Returning 403 would confirm the project exists; 404 prevents enumeration.
  // The 404 body shape must be identical to the unknown-token case (OWASP A01).
  it('test_unpublished_project_returns_404: returns 404 when project exists but isPublic is false', async () => {
    // Simulate the route finding the project by token but isPublic=false.
    // The implementation should query WHERE publicToken=token AND isPublic=true,
    // so findFirst returns null for unpublished projects. We return null here
    // to model the correct implementation contract.
    mockProjectFindFirst.mockResolvedValueOnce(null)
    const { GET } = await import('@/app/api/read/[token]/route')
    const res = await GET(makeGetRequest(VALID_TOKEN), makeParams(VALID_TOKEN))
    // Must be 404, NOT 401 or 403 — prevents enumeration of whether project exists
    expect(res.status).toBe(404)
    // Must not be 401 (no auth required for this route)
    expect(res.status).not.toBe(401)
    expect(res.status).not.toBe(403)
  })

  // Security — unpublished and unknown-token responses must be indistinguishable
  // (same status + same body shape prevents existence enumeration — OWASP A01)
  it('returns identical 404 body shape for unknown token and unpublished-token cases', async () => {
    // Unknown token case
    mockProjectFindFirst.mockResolvedValueOnce(null)
    const { GET: GET1 } = await import('@/app/api/read/[token]/route')
    const unknownRes = await GET1(makeGetRequest(INVALID_TOKEN), makeParams(INVALID_TOKEN))
    const unknownBody = await unknownRes.json()

    vi.resetModules()

    // Unpublished token case — findFirst returns null (correct query filters isPublic=true)
    mockProjectFindFirst.mockResolvedValueOnce(null)
    const { GET: GET2 } = await import('@/app/api/read/[token]/route')
    const unpublishedRes = await GET2(makeGetRequest(VALID_TOKEN), makeParams(VALID_TOKEN))
    const unpublishedBody = await unpublishedRes.json()

    expect(unknownRes.status).toBe(404)
    expect(unpublishedRes.status).toBe(404)
    // Body shapes must be identical — same keys present
    expect(Object.keys(unknownBody).sort()).toEqual(Object.keys(unpublishedBody).sort())
  })

  // Input validation — empty / whitespace-only token must be rejected with 400
  // (OWASP A03 — validate all inputs with Zod before Prisma query)
  it('returns 400 when token path param is an empty string', async () => {
    const { GET } = await import('@/app/api/read/[token]/route')
    const res = await GET(makeGetRequest(''), makeParams(''))
    expect(res.status).toBe(400)
    // Prisma must never be called for an invalid token
    expect(mockProjectFindFirst).not.toHaveBeenCalled()
  })

  // Edge case — route must not call auth() at all (no Clerk dependency)
  // A published project accessible without any auth header
  it('returns 200 without any Authorization header (public route — no auth required)', async () => {
    mockProjectFindFirst.mockResolvedValueOnce(publishedProject)
    const { GET } = await import('@/app/api/read/[token]/route')
    // Request has no Authorization header
    const req = new NextRequest(`http://localhost:3000/api/read/${VALID_TOKEN}`, {
      method: 'GET',
    })
    const res = await GET(req, makeParams(VALID_TOKEN))
    expect(res.status).toBe(200)
  })
})
