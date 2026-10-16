/**
 * POST /api/projects/[id]/bible/scan — starts a whole-book pre-scan on the
 * Worker; GET /api/projects/[id]/bible — scan status + style guide.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))
vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server')
  return { ...actual, after: (fn: () => void | Promise<void>) => void fn() }
})

const mockProjectFindUnique = vi.fn()
const mockBibleFindUnique = vi.fn()
const mockBibleUpsert = vi.fn()
const mockBibleUpdate = vi.fn()
const mockChapterFindMany = vi.fn()
const mockJobCreate = vi.fn()
const mockJobUpdate = vi.fn()
const mockUserFindUnique = vi.fn()

vi.mock('@/lib/prisma', () => ({
  default: {
    project: { findUnique: (...a: unknown[]) => mockProjectFindUnique(...a) },
    bookBible: {
      findUnique: (...a: unknown[]) => mockBibleFindUnique(...a),
      upsert: (...a: unknown[]) => mockBibleUpsert(...a),
      update: (...a: unknown[]) => mockBibleUpdate(...a),
    },
    chapter: { findMany: (...a: unknown[]) => mockChapterFindMany(...a) },
    translationJob: {
      create: (...a: unknown[]) => mockJobCreate(...a),
      update: (...a: unknown[]) => mockJobUpdate(...a),
    },
    user: { findUnique: (...a: unknown[]) => mockUserFindUnique(...a) },
  },
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { auth } from '@clerk/nextjs/server'
type AuthReturn = Awaited<ReturnType<typeof auth>>

const PROJECT_ID = 'clh3p7b1p0001qzrmkf8g4m0i'
const JOB_ID = 'clh3p7b1p0003qzrmkf8g4m0k'
const USER_ID = 'user_owner'
const params = { params: Promise.resolve({ id: PROJECT_ID }) }

function post() {
  return new NextRequest(`http://localhost/api/projects/${PROJECT_ID}/bible/scan`, {
    method: 'POST',
  })
}

function signedIn(userId: string | null = USER_ID) {
  vi.mocked(auth).mockResolvedValueOnce({ userId } as AuthReturn)
}

describe('POST /api/projects/[id]/bible/scan', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    process.env.WORKER_URL = 'http://worker.test'
    mockProjectFindUnique.mockResolvedValue({ id: PROJECT_ID, ownerId: USER_ID, targetLang: 'zh-Hans' })
    mockBibleFindUnique.mockResolvedValue(null)
    mockUserFindUnique.mockResolvedValue({ apiKey: 'sk-test', apiProvider: 'deepseek', apiBaseUrl: null })
    mockChapterFindMany.mockResolvedValue([
      { segments: [{ source: 'Georg wrote.' }, { source: 'Frieda spoke.' }] },
      { segments: [] },
      { segments: [{ source: 'The river ran.' }] },
    ])
    mockJobCreate.mockResolvedValue({ id: JOB_ID, status: 'PENDING' })
    mockFetch.mockResolvedValue(new Response('{}', { status: 202 }))
  })

  it('returns 401 when signed out', async () => {
    signedIn(null)
    const { POST } = await import('@/app/api/projects/[id]/bible/scan/route')
    expect((await POST(post(), params)).status).toBe(401)
  })

  it('returns 403 for another user’s project', async () => {
    signedIn('user_intruder')
    const { POST } = await import('@/app/api/projects/[id]/bible/scan/route')
    expect((await POST(post(), params)).status).toBe(403)
    expect(mockJobCreate).not.toHaveBeenCalled()
  })

  it('returns 402 without an API key', async () => {
    signedIn()
    mockUserFindUnique.mockResolvedValueOnce({ apiKey: null })
    const { POST } = await import('@/app/api/projects/[id]/bible/scan/route')
    expect((await POST(post(), params)).status).toBe(402)
  })

  it('returns 409 while a recent scan is still running', async () => {
    signedIn()
    mockBibleFindUnique.mockResolvedValueOnce({ scanStatus: 'SCANNING', scanStartedAt: new Date() })
    const { POST } = await import('@/app/api/projects/[id]/bible/scan/route')
    expect((await POST(post(), params)).status).toBe(409)
    expect(mockJobCreate).not.toHaveBeenCalled()
  })

  it('allows a new scan when the previous one is stale', async () => {
    signedIn()
    mockBibleFindUnique.mockResolvedValueOnce({
      scanStatus: 'SCANNING',
      scanStartedAt: new Date(Date.now() - 60 * 60 * 1000),
    })
    const { POST } = await import('@/app/api/projects/[id]/bible/scan/route')
    expect((await POST(post(), params)).status).toBe(202)
  })

  it('returns 400 when the book has no text', async () => {
    signedIn()
    mockChapterFindMany.mockResolvedValueOnce([{ segments: [] }])
    const { POST } = await import('@/app/api/projects/[id]/bible/scan/route')
    expect((await POST(post(), params)).status).toBe(400)
  })

  it('creates a poll job, marks the scan running and dispatches every chapter', async () => {
    signedIn()
    const { POST } = await import('@/app/api/projects/[id]/bible/scan/route')
    const res = await POST(post(), params)
    expect(res.status).toBe(202)
    expect(await res.json()).toEqual({ id: JOB_ID, status: 'PENDING' })

    expect(mockJobCreate).toHaveBeenCalledWith({
      data: { projectId: PROJECT_ID, status: 'PENDING' },
      select: { id: true, status: true },
    })
    expect(mockBibleUpsert).toHaveBeenCalledWith({
      where: { projectId: PROJECT_ID },
      // Review status is untouched: an existing bible stays in use while re-scanning.
      create: { projectId: PROJECT_ID, scanStatus: 'SCANNING', scanStartedAt: expect.any(Date), jobId: JOB_ID },
      update: { scanStatus: 'SCANNING', scanStartedAt: expect.any(Date), jobId: JOB_ID },
    })
    const [url, init] = mockFetch.mock.calls[0] as [string, { body: string }]
    expect(url).toBe('http://worker.test/bible/scan/async')
    const body = JSON.parse(init.body)
    expect(body).toMatchObject({
      job_id: JOB_ID,
      project_id: PROJECT_ID,
      target_lang: 'zh-Hans',
      chapters: [['Georg wrote.', 'Frieda spoke.'], ['The river ran.']],
    })
    expect(body.llm.llm_api_key).toBe('sk-test')
  })

  it.each([
    ['unreachable', () => mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'))],
    ['returns 503', () => mockFetch.mockResolvedValueOnce(new Response('busy', { status: 503 }))],
    ['rejects the payload (422)', () => mockFetch.mockResolvedValueOnce(new Response('{}', { status: 422 }))],
  ])('marks the job and the scan FAILED when the Worker is %s', async (_why, arrange) => {
    signedIn()
    arrange()
    const { POST } = await import('@/app/api/projects/[id]/bible/scan/route')
    await POST(post(), params)
    await vi.waitFor(() => expect(mockBibleUpdate).toHaveBeenCalled())
    expect(mockJobUpdate).toHaveBeenCalledWith({
      where: { id: JOB_ID },
      data: { status: 'FAILED', error: 'Worker unavailable' },
    })
    expect(mockBibleUpdate).toHaveBeenCalledWith({
      where: { projectId: PROJECT_ID },
      data: { scanStatus: 'FAILED' },
    })
  })
})

describe('GET /api/projects/[id]/bible', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mockProjectFindUnique.mockResolvedValue({ id: PROJECT_ID, ownerId: USER_ID })
  })

  it('returns the bible status and style guide', async () => {
    signedIn()
    const updatedAt = new Date('2026-10-16T10:00:00Z')
    mockBibleFindUnique.mockResolvedValueOnce({
      status: 'DRAFT',
      scanStatus: 'IDLE',
      styleGuide: '- 简洁',
      jobId: JOB_ID,
      updatedAt,
    })
    const { GET } = await import('@/app/api/projects/[id]/bible/route')
    const res = await GET(new NextRequest('http://localhost'), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      bible: {
        status: 'DRAFT',
        scanStatus: 'IDLE',
        styleGuide: '- 简洁',
        jobId: JOB_ID,
        updatedAt: updatedAt.toISOString(),
      },
    })
  })

  it('returns null before any scan', async () => {
    signedIn()
    mockBibleFindUnique.mockResolvedValueOnce(null)
    const { GET } = await import('@/app/api/projects/[id]/bible/route')
    expect(await (await GET(new NextRequest('http://localhost'), params)).json()).toEqual({ bible: null })
  })

  it('returns 403 for another user’s project', async () => {
    signedIn('user_intruder')
    const { GET } = await import('@/app/api/projects/[id]/bible/route')
    expect((await GET(new NextRequest('http://localhost'), params)).status).toBe(403)
    expect(mockBibleFindUnique).not.toHaveBeenCalled()
  })
})
