/**
 * Failing (red) tests for issue #29 — GET/PATCH/DELETE /api/projects/[id]
 *
 * Required by TDD red phase:
 *   - test_patch_project_checks_ownership  — non-owner PATCH → 403
 *   - test_delete_project_checks_ownership — non-owner DELETE → 403
 *   - test_patch_validates_body_with_zod   — invalid PATCH body → 400
 *
 * Additional tests cover the remaining acceptance criteria:
 *   - GET returns 401/403/404 per error matrix
 *   - PATCH happy path (name/targetLanguage/style/isPublic update)
 *   - DELETE cascades via Prisma (no explicit test needed beyond 204)
 *   - All routes return 401 when unauthenticated (OWASP A07)
 *
 * The PATCH and DELETE handlers do not exist yet — every import of those
 * named exports will be `undefined`, causing all related tests to fail.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { Prisma } from '@/app/generated/prisma/client'

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkMiddleware: vi.fn(() => vi.fn()),
  createRouteMatcher: vi.fn(() => vi.fn()),
}))

const mockProjectFindUnique = vi.fn()
const mockProjectUpdate = vi.fn()
const mockProjectDelete = vi.fn()

vi.mock('@/lib/prisma', () => ({
  default: {
    project: {
      findUnique: (...args: unknown[]) => mockProjectFindUnique(...args),
      update: (...args: unknown[]) => mockProjectUpdate(...args),
      delete: (...args: unknown[]) => mockProjectDelete(...args),
    },
  },
}))

import { auth } from '@clerk/nextjs/server'

type AuthReturn = Awaited<ReturnType<typeof auth>>

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------
const OWNER_ID = 'user_owner_abc'
const OTHER_USER_ID = 'user_intruder_xyz'
const PROJECT_ID = 'clh3p7b1p0001qzrmkf8g4m0i'

// Slim shape returned by requireProjectOwner's `select: { id, ownerId }`.
const fakeProjectSlim = {
  id: PROJECT_ID,
  ownerId: OWNER_ID,
}

// Full shape returned by GET's findUnique with includes.
const fakeProject = {
  ...fakeProjectSlim,
  title: 'My Novel',
  sourceFile: 'novel.pdf',
  sourceLang: 'en',
  targetLang: 'zh-Hans',
  status: 'READY',
  isPublic: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  chapters: [],
  jobs: [],
  glossary: [],
}

function makeP2025(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    'Record to update not found',
    { code: 'P2025', clientVersion: '7.7.0' },
  )
}

// ---------------------------------------------------------------------------
// Request factory helpers
// ---------------------------------------------------------------------------
function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

function makeGetRequest(id: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/projects/${id}`, {
    method: 'GET',
  })
}

function makePatchRequest(id: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost:3000/api/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeDeleteRequest(id: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/projects/${id}`, {
    method: 'DELETE',
  })
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------
describe('GET /api/projects/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  // OWASP A07 — auth guard
  it('returns 401 when user is not authenticated', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: null } as AuthReturn)
    const { GET } = await import('@/app/api/projects/[id]/route')
    const res = await GET(makeGetRequest(PROJECT_ID), makeParams(PROJECT_ID))
    expect(res.status).toBe(401)
  })

  // OWASP A01 — ownership check
  it('returns 403 when the authenticated user does not own the project', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: OTHER_USER_ID } as AuthReturn)
    mockProjectFindUnique.mockResolvedValueOnce({ ...fakeProject, ownerId: OWNER_ID })
    const { GET } = await import('@/app/api/projects/[id]/route')
    const res = await GET(makeGetRequest(PROJECT_ID), makeParams(PROJECT_ID))
    expect(res.status).toBe(403)
  })

  // Edge case — project not found
  it('returns 404 when the project does not exist', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: OWNER_ID } as AuthReturn)
    mockProjectFindUnique.mockResolvedValueOnce(null)
    const { GET } = await import('@/app/api/projects/[id]/route')
    const res = await GET(makeGetRequest(PROJECT_ID), makeParams(PROJECT_ID))
    expect(res.status).toBe(404)
  })

  // Happy path
  it('returns 200 with project data for the owning user', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: OWNER_ID } as AuthReturn)
    mockProjectFindUnique.mockResolvedValueOnce(fakeProject)
    const { GET } = await import('@/app/api/projects/[id]/route')
    const res = await GET(makeGetRequest(PROJECT_ID), makeParams(PROJECT_ID))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toBeDefined()
    expect(body.data.id).toBe(PROJECT_ID)
  })
})

// ---------------------------------------------------------------------------
describe('PATCH /api/projects/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  // OWASP A07 — auth guard
  it('returns 401 when user is not authenticated', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: null } as AuthReturn)
    const { PATCH } = await import('@/app/api/projects/[id]/route')
    const res = await PATCH(makePatchRequest(PROJECT_ID, { title: 'New Title' }), makeParams(PROJECT_ID))
    expect(res.status).toBe(401)
  })

  // OWASP A01 — ownership check  (required: test_patch_project_checks_ownership)
  it('returns 403 when authenticated non-owner calls PATCH', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: OTHER_USER_ID } as AuthReturn)
    mockProjectFindUnique.mockResolvedValueOnce(fakeProjectSlim)
    const { PATCH } = await import('@/app/api/projects/[id]/route')
    const res = await PATCH(
      makePatchRequest(PROJECT_ID, { title: 'Stolen Title' }),
      makeParams(PROJECT_ID),
    )
    expect(res.status).toBe(403)
  })

  // OWASP A03 — Zod validation  (required: test_patch_validates_body_with_zod)
  it('returns 400 with details when PATCH body contains an invalid field type', async () => {
    // isPublic must be boolean; sending a string should trigger Zod rejection
    vi.mocked(auth).mockResolvedValueOnce({ userId: OWNER_ID } as AuthReturn)
    mockProjectFindUnique.mockResolvedValueOnce(fakeProjectSlim)
    const { PATCH } = await import('@/app/api/projects/[id]/route')
    const res = await PATCH(
      makePatchRequest(PROJECT_ID, { isPublic: 'yes' }),  // wrong type
      makeParams(PROJECT_ID),
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Invalid request body')
    // Surface Zod's structured field errors (review #6) — no PII, just field names.
    expect(body.details).toBeDefined()
    expect(body.details.isPublic).toBeDefined()
  })

  // OWASP A03 — Zod validation rejects unknown fields when schema is strict
  it('returns 400 when PATCH body contains only unknown/extra fields', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: OWNER_ID } as AuthReturn)
    mockProjectFindUnique.mockResolvedValueOnce(fakeProjectSlim)
    const { PATCH } = await import('@/app/api/projects/[id]/route')
    const res = await PATCH(
      makePatchRequest(PROJECT_ID, { nonExistentField: 'value' }),
      makeParams(PROJECT_ID),
    )
    expect(res.status).toBe(400)
  })

  // Review #1 — empty body must not reach Prisma as a no-op UPDATE
  it('returns 400 when PATCH body is empty after mapping', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: OWNER_ID } as AuthReturn)
    mockProjectFindUnique.mockResolvedValueOnce(fakeProjectSlim)
    const { PATCH } = await import('@/app/api/projects/[id]/route')
    const res = await PATCH(makePatchRequest(PROJECT_ID, {}), makeParams(PROJECT_ID))
    expect(res.status).toBe(400)
    expect(mockProjectUpdate).not.toHaveBeenCalled()
  })

  // Edge case — project not found before ownership check ordering
  it('returns 404 when the project does not exist', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: OWNER_ID } as AuthReturn)
    mockProjectFindUnique.mockResolvedValueOnce(null)
    const { PATCH } = await import('@/app/api/projects/[id]/route')
    const res = await PATCH(
      makePatchRequest(PROJECT_ID, { title: 'New Title' }),
      makeParams(PROJECT_ID),
    )
    expect(res.status).toBe(404)
  })

  // Review #2 — P2025 from a racing delete must become a 404, not a 500
  it('returns 404 when prisma.project.update throws P2025 (concurrent delete)', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: OWNER_ID } as AuthReturn)
    mockProjectFindUnique.mockResolvedValueOnce(fakeProjectSlim)
    mockProjectUpdate.mockRejectedValueOnce(makeP2025())
    const { PATCH } = await import('@/app/api/projects/[id]/route')
    const res = await PATCH(
      makePatchRequest(PROJECT_ID, { name: 'New Title' }),
      makeParams(PROJECT_ID),
    )
    expect(res.status).toBe(404)
  })

  // Happy path — update title/targetLanguage (wrapped in { data: ... } to match GET)
  it('returns updated project in { data } envelope when owner sends a valid PATCH body', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: OWNER_ID } as AuthReturn)
    mockProjectFindUnique.mockResolvedValueOnce(fakeProjectSlim)
    const updatedProject = { ...fakeProject, title: 'New Title', targetLang: 'ja' }
    mockProjectUpdate.mockResolvedValueOnce(updatedProject)
    const { PATCH } = await import('@/app/api/projects/[id]/route')
    const res = await PATCH(
      makePatchRequest(PROJECT_ID, { name: 'New Title', targetLanguage: 'ja' }),
      makeParams(PROJECT_ID),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toBeDefined()
    expect(body.data.id).toBe(PROJECT_ID)
  })

  // Happy path — isPublic toggle
  it('returns updated project when owner toggles isPublic to true', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: OWNER_ID } as AuthReturn)
    mockProjectFindUnique.mockResolvedValueOnce(fakeProjectSlim)
    const updatedProject = { ...fakeProject, isPublic: true }
    mockProjectUpdate.mockResolvedValueOnce(updatedProject)
    const { PATCH } = await import('@/app/api/projects/[id]/route')
    const res = await PATCH(
      makePatchRequest(PROJECT_ID, { isPublic: true }),
      makeParams(PROJECT_ID),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.isPublic).toBe(true)
  })
})

// ---------------------------------------------------------------------------
describe('DELETE /api/projects/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  // OWASP A07 — auth guard
  it('returns 401 when user is not authenticated', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: null } as AuthReturn)
    const { DELETE } = await import('@/app/api/projects/[id]/route')
    const res = await DELETE(makeDeleteRequest(PROJECT_ID), makeParams(PROJECT_ID))
    expect(res.status).toBe(401)
  })

  // OWASP A01 — ownership check  (required: test_delete_project_checks_ownership)
  it('returns 403 when authenticated non-owner calls DELETE', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: OTHER_USER_ID } as AuthReturn)
    mockProjectFindUnique.mockResolvedValueOnce(fakeProjectSlim)
    const { DELETE } = await import('@/app/api/projects/[id]/route')
    const res = await DELETE(makeDeleteRequest(PROJECT_ID), makeParams(PROJECT_ID))
    expect(res.status).toBe(403)
  })

  // Edge case — project not found
  it('returns 404 when the project does not exist', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: OWNER_ID } as AuthReturn)
    mockProjectFindUnique.mockResolvedValueOnce(null)
    const { DELETE } = await import('@/app/api/projects/[id]/route')
    const res = await DELETE(makeDeleteRequest(PROJECT_ID), makeParams(PROJECT_ID))
    expect(res.status).toBe(404)
  })

  // Review #2 — P2025 from a racing delete must become a 404, not a 500
  it('returns 404 when prisma.project.delete throws P2025 (concurrent delete)', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: OWNER_ID } as AuthReturn)
    mockProjectFindUnique.mockResolvedValueOnce(fakeProjectSlim)
    mockProjectDelete.mockRejectedValueOnce(makeP2025())
    const { DELETE } = await import('@/app/api/projects/[id]/route')
    const res = await DELETE(makeDeleteRequest(PROJECT_ID), makeParams(PROJECT_ID))
    expect(res.status).toBe(404)
  })

  // Happy path — delete cascades via Prisma schema (onDelete: Cascade on Chapter/Job)
  it('returns 204 and calls prisma.project.delete for the owning user', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: OWNER_ID } as AuthReturn)
    mockProjectFindUnique.mockResolvedValueOnce(fakeProjectSlim)
    mockProjectDelete.mockResolvedValueOnce(fakeProject)
    const { DELETE } = await import('@/app/api/projects/[id]/route')
    const res = await DELETE(makeDeleteRequest(PROJECT_ID), makeParams(PROJECT_ID))
    expect(res.status).toBe(204)
    expect(mockProjectDelete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: PROJECT_ID } })
    )
  })
})
