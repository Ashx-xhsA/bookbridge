/**
 * Failing (red) tests for issue #30 — PATCH + DELETE
 * /api/projects/[id]/glossary/[termId]
 *
 * The route does not exist yet. "Cannot find module" or assertion failures
 * both confirm the implementation is missing — all tests must fail until the
 * green phase.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Mock Clerk auth
// ---------------------------------------------------------------------------
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkMiddleware: vi.fn(() => vi.fn()),
  createRouteMatcher: vi.fn(() => vi.fn()),
}))

// ---------------------------------------------------------------------------
// Mock Prisma singleton
// ---------------------------------------------------------------------------
const mockProjectFindUnique = vi.fn()
const mockTermFindUnique = vi.fn()
const mockTermUpdate = vi.fn()
const mockTermDelete = vi.fn()

vi.mock('@/lib/prisma', () => ({
  default: {
    project: {
      findUnique: (...args: unknown[]) => mockProjectFindUnique(...args),
    },
    glossaryTerm: {
      findUnique: (...args: unknown[]) => mockTermFindUnique(...args),
      update: (...args: unknown[]) => mockTermUpdate(...args),
      delete: (...args: unknown[]) => mockTermDelete(...args),
    },
  },
}))

import { auth } from '@clerk/nextjs/server'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const PROJECT_ID = 'proj-abc'
const TERM_ID = 'term-xyz'
const OWNER_ID = 'user_owner'
const OTHER_USER = 'user_other'

const BASE_URL = `http://localhost:3000/api/projects/${PROJECT_ID}/glossary/${TERM_ID}`

function makeParams(): Promise<{ id: string; termId: string }> {
  return Promise.resolve({ id: PROJECT_ID, termId: TERM_ID })
}

function makeRequest(
  method: string,
  body?: Record<string, unknown>
): NextRequest {
  return new NextRequest(BASE_URL, {
    method,
    ...(body !== undefined
      ? {
          body: JSON.stringify(body),
          headers: { 'Content-Type': 'application/json' },
        }
      : {}),
  })
}

// ---------------------------------------------------------------------------
// PATCH tests
// ---------------------------------------------------------------------------
describe('PATCH /api/projects/[id]/glossary/[termId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValueOnce(
      { userId: null } as ReturnType<typeof auth> extends Promise<infer T> ? T : never
    )
    const { PATCH } = await import(
      '@/app/api/projects/[id]/glossary/[termId]/route'
    )
    const res = await PATCH(makeRequest('PATCH', { translation: '你好' }), {
      params: makeParams(),
    })
    expect(res.status).toBe(401)
  })

  it('returns 403 when the project belongs to another user', async () => {
    vi.mocked(auth).mockResolvedValueOnce(
      { userId: OTHER_USER } as ReturnType<typeof auth> extends Promise<infer T> ? T : never
    )
    mockProjectFindUnique.mockResolvedValueOnce({
      id: PROJECT_ID,
      ownerId: OWNER_ID,
    })
    const { PATCH } = await import(
      '@/app/api/projects/[id]/glossary/[termId]/route'
    )
    const res = await PATCH(makeRequest('PATCH', { translation: '你好' }), {
      params: makeParams(),
    })
    expect(res.status).toBe(403)
  })

  it('returns 400 when body fails Zod validation (approved is not a boolean)', async () => {
    vi.mocked(auth).mockResolvedValueOnce(
      { userId: OWNER_ID } as ReturnType<typeof auth> extends Promise<infer T> ? T : never
    )
    mockProjectFindUnique.mockResolvedValueOnce({
      id: PROJECT_ID,
      ownerId: OWNER_ID,
    })
    const { PATCH } = await import(
      '@/app/api/projects/[id]/glossary/[termId]/route'
    )
    const res = await PATCH(makeRequest('PATCH', { approved: 'yes' }), {
      params: makeParams(),
    })
    expect(res.status).toBe(400)
  })

  it('returns updated row with userEdited:true when translation is changed', async () => {
    vi.mocked(auth).mockResolvedValueOnce(
      { userId: OWNER_ID } as ReturnType<typeof auth> extends Promise<infer T> ? T : never
    )
    mockProjectFindUnique.mockResolvedValueOnce({
      id: PROJECT_ID,
      ownerId: OWNER_ID,
    })
    mockTermFindUnique.mockResolvedValueOnce({
      id: TERM_ID,
      projectId: PROJECT_ID,
      english: 'bridge',
      translation: '桥',
      category: 'general',
      approved: false,
      userEdited: false,
    })
    const updated = {
      id: TERM_ID,
      projectId: PROJECT_ID,
      english: 'bridge',
      translation: '大桥',
      category: 'general',
      approved: false,
      userEdited: true,
    }
    mockTermUpdate.mockResolvedValueOnce(updated)

    const { PATCH } = await import(
      '@/app/api/projects/[id]/glossary/[termId]/route'
    )
    const res = await PATCH(makeRequest('PATCH', { translation: '大桥' }), {
      params: makeParams(),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.userEdited).toBe(true)
    expect(body.data.translation).toBe('大桥')
    // Verify the update call set userEdited: true
    expect(mockTermUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userEdited: true }),
      })
    )
  })

  it('userEdited stays false when only approved is flipped', async () => {
    vi.mocked(auth).mockResolvedValueOnce(
      { userId: OWNER_ID } as ReturnType<typeof auth> extends Promise<infer T> ? T : never
    )
    mockProjectFindUnique.mockResolvedValueOnce({
      id: PROJECT_ID,
      ownerId: OWNER_ID,
    })
    mockTermFindUnique.mockResolvedValueOnce({
      id: TERM_ID,
      projectId: PROJECT_ID,
      english: 'bridge',
      translation: '桥',
      category: 'general',
      approved: false,
      userEdited: false,
    })
    const updated = {
      id: TERM_ID,
      projectId: PROJECT_ID,
      english: 'bridge',
      translation: '桥',
      category: 'general',
      approved: true,
      userEdited: false,
    }
    mockTermUpdate.mockResolvedValueOnce(updated)

    const { PATCH } = await import(
      '@/app/api/projects/[id]/glossary/[termId]/route'
    )
    const res = await PATCH(makeRequest('PATCH', { approved: true }), {
      params: makeParams(),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.userEdited).toBe(false)
    // Verify the update call did NOT set userEdited: true
    expect(mockTermUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ userEdited: true }),
      })
    )
  })

  it('returns 404 when termId does not exist', async () => {
    vi.mocked(auth).mockResolvedValueOnce(
      { userId: OWNER_ID } as ReturnType<typeof auth> extends Promise<infer T> ? T : never
    )
    mockProjectFindUnique.mockResolvedValueOnce({
      id: PROJECT_ID,
      ownerId: OWNER_ID,
    })
    mockTermFindUnique.mockResolvedValueOnce(null)

    const { PATCH } = await import(
      '@/app/api/projects/[id]/glossary/[termId]/route'
    )
    const res = await PATCH(makeRequest('PATCH', { translation: '大桥' }), {
      params: makeParams(),
    })
    expect(res.status).toBe(404)
    expect(mockTermUpdate).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// DELETE tests
// ---------------------------------------------------------------------------
describe('DELETE /api/projects/[id]/glossary/[termId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(auth).mockResolvedValueOnce(
      { userId: null } as ReturnType<typeof auth> extends Promise<infer T> ? T : never
    )
    const { DELETE } = await import(
      '@/app/api/projects/[id]/glossary/[termId]/route'
    )
    const res = await DELETE(makeRequest('DELETE'), { params: makeParams() })
    expect(res.status).toBe(401)
  })

  it('returns 403 when the project belongs to another user', async () => {
    vi.mocked(auth).mockResolvedValueOnce(
      { userId: OTHER_USER } as ReturnType<typeof auth> extends Promise<infer T> ? T : never
    )
    mockProjectFindUnique.mockResolvedValueOnce({
      id: PROJECT_ID,
      ownerId: OWNER_ID,
    })
    const { DELETE } = await import(
      '@/app/api/projects/[id]/glossary/[termId]/route'
    )
    const res = await DELETE(makeRequest('DELETE'), { params: makeParams() })
    expect(res.status).toBe(403)
  })

  it('returns 404 when termId does not exist', async () => {
    vi.mocked(auth).mockResolvedValueOnce(
      { userId: OWNER_ID } as ReturnType<typeof auth> extends Promise<infer T> ? T : never
    )
    mockProjectFindUnique.mockResolvedValueOnce({
      id: PROJECT_ID,
      ownerId: OWNER_ID,
    })
    mockTermFindUnique.mockResolvedValueOnce(null)

    const { DELETE } = await import(
      '@/app/api/projects/[id]/glossary/[termId]/route'
    )
    const res = await DELETE(makeRequest('DELETE'), { params: makeParams() })
    expect(res.status).toBe(404)
    expect(mockTermDelete).not.toHaveBeenCalled()
  })

  it('returns 204 and removes the row on success', async () => {
    vi.mocked(auth).mockResolvedValueOnce(
      { userId: OWNER_ID } as ReturnType<typeof auth> extends Promise<infer T> ? T : never
    )
    mockProjectFindUnique.mockResolvedValueOnce({
      id: PROJECT_ID,
      ownerId: OWNER_ID,
    })
    mockTermFindUnique.mockResolvedValueOnce({
      id: TERM_ID,
      projectId: PROJECT_ID,
    })
    mockTermDelete.mockResolvedValueOnce({ id: TERM_ID })

    const { DELETE } = await import(
      '@/app/api/projects/[id]/glossary/[termId]/route'
    )
    const res = await DELETE(makeRequest('DELETE'), { params: makeParams() })
    expect(res.status).toBe(204)
    expect(mockTermDelete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: TERM_ID } })
    )
  })
})
