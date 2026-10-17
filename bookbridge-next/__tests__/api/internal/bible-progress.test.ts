/**
 * POST /api/internal/worker-callback/bible/progress — the Worker reports how
 * far a bible scan got after each step. The reply tells it whether to go on:
 * a stopped or superseded scan gets {continue: false} and the Worker quits.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockBibleUpdateMany = vi.fn()

vi.mock('@/lib/prisma', () => ({
  default: {
    bookBible: { updateMany: (...a: unknown[]) => mockBibleUpdateMany(...a) },
  },
}))

const SECRET = 'test-shared-secret'
const JOB_ID = 'clh3p7b1p0003qzrmkf8g4m0k'
const PROJECT_ID = 'clh3p7b1p0001qzrmkf8g4m0i'
const BODY = { job_id: JOB_ID, project_id: PROJECT_ID, done: 23, total: 69 }

function req(body: unknown, secret: string | null = SECRET) {
  return new NextRequest('http://localhost/api/internal/worker-callback/bible/progress', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...(secret ? { 'X-Worker-Secret': secret } : {}) },
  })
}

async function post(body: unknown, secret?: string | null) {
  const { POST } = await import('@/app/api/internal/worker-callback/bible/progress/route')
  return POST(req(body, secret))
}

describe('POST /api/internal/worker-callback/bible/progress', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.WORKER_CALLBACK_SECRET = SECRET
  })

  it('rejects a caller without the worker secret', async () => {
    expect((await post(BODY, null)).status).toBe(401)
    expect((await post(BODY, 'wrong-secret-value')).status).toBe(401)
    expect(mockBibleUpdateMany).not.toHaveBeenCalled()
  })

  it.each([
    ['bad JSON', '{'],
    ['negative done', { ...BODY, done: -1 }],
    ['zero total', { ...BODY, total: 0 }],
    ['done past total', { ...BODY, done: 70 }],
    ['missing job', { ...BODY, job_id: undefined }],
  ])('rejects %s', async (_why, body) => {
    expect((await post(body)).status).toBe(400)
    expect(mockBibleUpdateMany).not.toHaveBeenCalled()
  })

  it('records progress and a heartbeat for the running scan of this job only', async () => {
    mockBibleUpdateMany.mockResolvedValueOnce({ count: 1 })
    const res = await post(BODY)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ continue: true })
    expect(mockBibleUpdateMany).toHaveBeenCalledWith({
      where: { projectId: PROJECT_ID, jobId: JOB_ID, scanStatus: 'SCANNING' },
      data: { scanDone: 23, scanTotal: 69, scanHeartbeatAt: expect.any(Date) },
    })
  })

  it('tells the worker to stop when the scan was stopped or superseded', async () => {
    mockBibleUpdateMany.mockResolvedValueOnce({ count: 0 })
    const res = await post(BODY)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ continue: false })
  })
})
