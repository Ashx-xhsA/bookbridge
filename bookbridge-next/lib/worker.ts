// Kept under Vercel's 10 s function ceiling (hobby tier) so the route can
// still return its own 502 / FAILED writes instead of hitting a gateway 504.
const TIMEOUT_MS = 6000

function getWorkerUrl(): string {
  const url = process.env.WORKER_URL
  if (!url) {
    throw new Error(
      'WORKER_URL environment variable is not set. Refusing to call a hardcoded fallback.'
    )
  }
  return url
}

export async function workerFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  try {
    return await fetch(`${getWorkerUrl()}${path}`, {
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
