/**
 * POST /api/internal/worker-callback/bible — the Worker posts a finished
 * (or failed) pre-scan. Merges entities into the glossary (lib/bible-merge),
 * stores the style guide, and marks the poll job terminal last.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockBibleFindUnique = vi.fn()
const mockBibleUpdate = vi.fn()
const mockTermFindMany = vi.fn()
const mockTermCreateManyAndReturn = vi.fn()
const mockTermUpdate = vi.fn()
const mockTermUpdateMany = vi.fn()
const mockJobUpdate = vi.fn()
const order: string[] = []

const tx = {
  glossaryTerm: {
    createManyAndReturn: (a: unknown) => (order.push('createMany'), mockTermCreateManyAndReturn(a)),
    update: (a: unknown) => (order.push('update'), mockTermUpdate(a)),
    updateMany: (a: unknown) => (order.push('link'), mockTermUpdateMany(a)),
  },
  bookBible: { update: (a: unknown) => (order.push('bible'), mockBibleUpdate(a)) },
  translationJob: { update: (a: unknown) => (order.push('job'), mockJobUpdate(a)) },
}

vi.mock('@/lib/prisma', () => ({
  default: {
    bookBible: {
      findUnique: (...a: unknown[]) => mockBibleFindUnique(...a),
      update: (a: unknown) => mockBibleUpdate(a),
    },
    glossaryTerm: { findMany: (...a: unknown[]) => mockTermFindMany(...a) },
    translationJob: { update: (a: unknown) => mockJobUpdate(a) },
    $transaction: async (arg: unknown) =>
      typeof arg === 'function' ? (arg as (t: typeof tx) => unknown)(tx) : Promise.all(arg as unknown[]),
  },
}))

const SECRET = 'test-shared-secret'
const JOB_ID = 'clh3p7b1p0003qzrmkf8g4m0k'
const PROJECT_ID = 'clh3p7b1p0001qzrmkf8g4m0i'

const ENTITY = {
  english: 'Gandalf',
  translation: '甘道夫',
  category: 'person',
  gender: 'male',
  notes: null,
  voice: 'Grave.',
  mentions: 40,
  aliases: [{ english: 'Mithrandir', translation: '米斯兰达' }],
}

const OK = {
  job_id: JOB_ID,
  project_id: PROJECT_ID,
  status: 'SUCCEEDED',
  style_guide: '- 简洁克制',
  entities: [ENTITY],
}

function req(body: unknown, secret: string | null = SECRET) {
  return new NextRequest('http://localhost/api/internal/worker-callback/bible', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...(secret ? { 'X-Worker-Secret': secret } : {}) },
  })
}

describe('POST /api/internal/worker-callback/bible', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    order.length = 0
    process.env.WORKER_CALLBACK_SECRET = SECRET
    mockBibleFindUnique.mockResolvedValue({ jobId: JOB_ID, styleGuideEdited: false })
    mockTermFindMany.mockResolvedValue([])
    mockTermCreateManyAndReturn.mockResolvedValue([
      { id: 'g1', english: 'Gandalf' },
      { id: 'm1', english: 'Mithrandir' },
    ])
  })

  it('returns 401 without the shared secret', async () => {
    const { POST } = await import('@/app/api/internal/worker-callback/bible/route')
    expect((await POST(req(OK, null))).status).toBe(401)
    expect((await POST(req(OK, 'wrong'))).status).toBe(401)
    expect(mockBibleFindUnique).not.toHaveBeenCalled()
  })

  it.each([
    { ...OK, entities: [{ ...ENTITY, translation: '' }] },
    { ...OK, entities: [{ ...ENTITY, mentions: -1 }] },
    { ...OK, status: 'RUNNING' },
    { job_id: JOB_ID, status: 'SUCCEEDED' },
  ])('returns 400 for a malformed body %#', async (body) => {
    const { POST } = await import('@/app/api/internal/worker-callback/bible/route')
    expect((await POST(req(body))).status).toBe(400)
  })

  it('returns 404 when the project has no bible row', async () => {
    mockBibleFindUnique.mockResolvedValueOnce(null)
    const { POST } = await import('@/app/api/internal/worker-callback/bible/route')
    expect((await POST(req(OK))).status).toBe(404)
  })

  it('returns 409 and writes nothing for a superseded scan', async () => {
    mockBibleFindUnique.mockResolvedValueOnce({ jobId: 'clh3p7b1p0009qzrmkf8g4zzz' })
    const { POST } = await import('@/app/api/internal/worker-callback/bible/route')
    expect((await POST(req(OK))).status).toBe(409)
    expect(order).toEqual([])
  })

  it('merges entities, links aliases, stores the style guide, then completes the job', async () => {
    const { POST } = await import('@/app/api/internal/worker-callback/bible/route')
    const res = await POST(req(OK))
    expect(res.status).toBe(200)

    expect(mockTermFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: PROJECT_ID } })
    )
    const created = mockTermCreateManyAndReturn.mock.calls[0][0] as { data: { english: string; projectId: string }[] }
    expect(created.data.map((d) => d.english)).toEqual(['Gandalf', 'Mithrandir'])
    expect(created.data.every((d) => d.projectId === PROJECT_ID)).toBe(true)
    expect(mockTermUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ['m1'] }, projectId: PROJECT_ID },
      data: { aliasOfId: 'g1' },
    })
    expect(mockBibleUpdate).toHaveBeenCalledWith({
      where: { projectId: PROJECT_ID },
      data: { status: 'DRAFT', scanStatus: 'IDLE', styleGuide: '- 简洁克制' },
    })
    expect(mockJobUpdate).toHaveBeenCalledWith({
      where: { id: JOB_ID },
      data: { status: 'SUCCEEDED', error: null },
    })
    expect(order.at(-1)).toBe('job')
  })

  it('updates existing unedited terms in place', async () => {
    mockTermFindMany.mockResolvedValueOnce([
      {
        id: 't1', english: 'Gandalf', translation: '冈达夫', approved: false, userEdited: false,
        gender: null, voice: null, notes: null, aliasOfId: null,
      },
    ])
    mockTermCreateManyAndReturn.mockResolvedValueOnce([{ id: 'm1', english: 'Mithrandir' }])
    const { POST } = await import('@/app/api/internal/worker-callback/bible/route')
    await POST(req(OK))
    expect(mockTermUpdate).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: expect.objectContaining({ translation: '甘道夫', mentions: 40 }),
    })
    expect(mockTermUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ['m1'] }, projectId: PROJECT_ID },
      data: { aliasOfId: 't1' },
    })
  })

  it('keeps a style guide the user edited', async () => {
    mockBibleFindUnique.mockResolvedValueOnce({ jobId: JOB_ID, styleGuideEdited: true })
    const { POST } = await import('@/app/api/internal/worker-callback/bible/route')
    await POST(req(OK))
    expect(mockBibleUpdate).toHaveBeenCalledWith({
      where: { projectId: PROJECT_ID },
      data: { status: 'DRAFT', scanStatus: 'IDLE' },
    })
  })

  it('never replaces the style guide with an empty one', async () => {
    const { POST } = await import('@/app/api/internal/worker-callback/bible/route')
    await POST(req({ ...OK, style_guide: '  ' }))
    expect(mockBibleUpdate).toHaveBeenCalledWith({
      where: { projectId: PROJECT_ID },
      data: { status: 'DRAFT', scanStatus: 'IDLE' },
    })
  })

  it('rejects a style guide longer than the Worker accepts back', async () => {
    const { POST } = await import('@/app/api/internal/worker-callback/bible/route')
    expect((await POST(req({ ...OK, style_guide: 'x'.repeat(5001) }))).status).toBe(400)
  })

  it('marks the scan and job FAILED but keeps the bible in use', async () => {
    const { POST } = await import('@/app/api/internal/worker-callback/bible/route')
    const res = await POST(
      req({ job_id: JOB_ID, project_id: PROJECT_ID, status: 'FAILED', error: 'Bible scan failed' })
    )
    expect(res.status).toBe(200)
    expect(mockBibleUpdate).toHaveBeenCalledWith({
      where: { projectId: PROJECT_ID },
      data: { scanStatus: 'FAILED' },
    })
    expect(mockJobUpdate).toHaveBeenCalledWith({
      where: { id: JOB_ID },
      data: { status: 'FAILED', error: 'Bible scan failed' },
    })
    expect(mockTermCreateManyAndReturn).not.toHaveBeenCalled()
  })
})
