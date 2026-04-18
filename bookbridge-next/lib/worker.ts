const TIMEOUT_MS = 8000

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
