const WORKER_URL = process.env.WORKER_URL || 'http://localhost:8000'
const TIMEOUT_MS = 8000

export async function workerFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  if (process.env.NODE_ENV === 'production' && !process.env.WORKER_URL) {
    throw new Error('Worker unavailable')
  }
  try {
    return await fetch(`${WORKER_URL}${path}`, {
      ...init,
      headers: { ...init?.headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'TimeoutError'
    console.error(`[workerFetch] ${isTimeout ? 'timeout' : 'connection error'} — ${path}`)
    throw new Error(isTimeout ? 'Worker timeout' : 'Worker unavailable')
  }
}
