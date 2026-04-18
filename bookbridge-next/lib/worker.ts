const WORKER_URL = process.env.WORKER_URL || 'http://localhost:8000'

export async function workerFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const url = `${WORKER_URL}${path}`
  try {
    return await fetch(url, {
      ...init,
      headers: {
        ...init?.headers,
      },
    })
  } catch {
    throw new Error(`Worker unavailable at ${WORKER_URL}`)
  }
}
