import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('workerFetch', () => {
  beforeEach(() => {
    vi.resetModules()
    mockFetch.mockReset()
    process.env.WORKER_URL = 'http://test-worker:9000'
  })

  it('prepends WORKER_URL to the path', async () => {
    mockFetch.mockResolvedValueOnce(new Response('ok'))
    const { workerFetch } = await import('@/lib/worker')
    await workerFetch('/health')
    expect(mockFetch).toHaveBeenCalledWith(
      'http://test-worker:9000/health',
      expect.objectContaining({ headers: {} })
    )
  })

  it('throws when worker is unreachable', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'))
    const { workerFetch } = await import('@/lib/worker')
    await expect(workerFetch('/health')).rejects.toThrow('Worker unavailable')
  })

  it('passes through request init options', async () => {
    mockFetch.mockResolvedValueOnce(new Response('ok'))
    const { workerFetch } = await import('@/lib/worker')
    await workerFetch('/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    expect(mockFetch).toHaveBeenCalledWith(
      'http://test-worker:9000/parse',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    )
  })
})
