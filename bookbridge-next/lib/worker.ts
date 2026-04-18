const WORKER_URL = process.env.WORKER_URL || 'https://passionate-serenity-production-3cdd.up.railway.app'
const TIMEOUT_MS = 8000

export async function workerFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
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
