const WORKER_URL = process.env.WORKER_URL

if (process.env.NODE_ENV === 'production' && !WORKER_URL) {
  throw new Error('WORKER_URL environment variable is not set')
}

const BASE_URL = WORKER_URL || 'http://localhost:8000'
const TIMEOUT_MS = 8000

export async function workerFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  try {
    return await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: { ...init?.headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    throw new Error('Worker unavailable')
  }
}
