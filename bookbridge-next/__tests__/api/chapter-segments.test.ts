import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkMiddleware: vi.fn(() => vi.fn()),
  createRouteMatcher: vi.fn(() => vi.fn()),
}))

const mockProjectFindUnique = vi.fn()
const mockChapterFindUnique = vi.fn()

vi.mock('@/lib/prisma', () => ({
  default: {
    project: {
      findUnique: (...args: unknown[]) => mockProjectFindUnique(...args),
    },
    chapter: {
      findUnique: (...args: unknown[]) => mockChapterFindUnique(...args),
    },
  },
}))

import { auth } from '@clerk/nextjs/server'

type AuthResult = ReturnType<typeof auth> extends Promise<infer T> ? T : never

const PROJECT_ID = 'proj1'
const CHAPTER_ID = 'chap1'
const url = `http://localhost:3000/api/projects/${PROJECT_ID}/chapters/${CHAPTER_ID}`

const issue = { category: 'omission', severity: 'error', message: 'second clause dropped' }

const chapter = {
  id: CHAPTER_ID,
  projectId: PROJECT_ID,
  number: 3,
  title: 'The Judgment',
  segments: [
    { index: 0, source: 'A.', translation: '甲', status: 'reviewed', reviewIssues: [] },
    { index: 1, source: 'B.', translation: '乙', status: 'flagged', reviewIssues: [issue] },
    { index: 2, source: 'C.', translation: null, status: 'pending', reviewIssues: [] },
  ],
}

function signIn(userId: string | null) {
  vi.mocked(auth).mockResolvedValueOnce({ userId } as AuthResult)
}

function params(id = PROJECT_ID, chapterId = CHAPTER_ID) {
  return { params: Promise.resolve({ id, chapterId }) }
}

async function get(id = PROJECT_ID, chapterId = CHAPTER_ID) {
  const { GET } = await import('@/app/api/projects/[id]/chapters/[chapterId]/route')
  return GET(new NextRequest(url), params(id, chapterId))
}

describe('GET /api/projects/[id]/chapters/[chapterId]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    signIn(null)
    const res = await get()
    expect(res.status).toBe(401)
    expect(mockChapterFindUnique).not.toHaveBeenCalled()
  })

  it('returns 400 for an oversized chapter id', async () => {
    signIn('user_abc')
    const res = await get(PROJECT_ID, 'x'.repeat(300))
    expect(res.status).toBe(400)
    expect(mockProjectFindUnique).not.toHaveBeenCalled()
  })

  it('returns 404 when the project does not exist', async () => {
    signIn('user_abc')
    mockProjectFindUnique.mockResolvedValueOnce(null)
    const res = await get()
    expect(res.status).toBe(404)
  })

  it("returns 403 for someone else's project and does not read the chapter", async () => {
    signIn('user_other')
    mockProjectFindUnique.mockResolvedValueOnce({ id: PROJECT_ID, ownerId: 'user_abc' })
    const res = await get()
    expect(res.status).toBe(403)
    expect(mockChapterFindUnique).not.toHaveBeenCalled()
  })

  it('returns 404 for a chapter that belongs to another project', async () => {
    signIn('user_abc')
    mockProjectFindUnique.mockResolvedValueOnce({ id: PROJECT_ID, ownerId: 'user_abc' })
    mockChapterFindUnique.mockResolvedValueOnce({ ...chapter, projectId: 'other' })
    const res = await get()
    expect(res.status).toBe(404)
  })

  it('returns 404 for an unknown chapter', async () => {
    signIn('user_abc')
    mockProjectFindUnique.mockResolvedValueOnce({ id: PROJECT_ID, ownerId: 'user_abc' })
    mockChapterFindUnique.mockResolvedValueOnce(null)
    const res = await get()
    expect(res.status).toBe(404)
  })

  it('returns the aligned segments with status and open issues for the owner', async () => {
    signIn('user_abc')
    mockProjectFindUnique.mockResolvedValueOnce({ id: PROJECT_ID, ownerId: 'user_abc' })
    mockChapterFindUnique.mockResolvedValueOnce(chapter)
    const res = await get()
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data).toEqual({
      id: CHAPTER_ID,
      number: 3,
      title: 'The Judgment',
      segments: [
        { index: 0, source: 'A.', translation: '甲', status: 'reviewed', issues: [] },
        { index: 1, source: 'B.', translation: '乙', status: 'flagged', issues: [issue] },
        { index: 2, source: 'C.', translation: null, status: 'pending', issues: [] },
      ],
    })
    expect(data.projectId).toBeUndefined()
  })
})
