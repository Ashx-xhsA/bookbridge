export type JobStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED'

export type JobSnapshot = {
  id: string
  status: JobStatus
  translatedContent?: string
  error?: string
}

export type PollJobOptions = {
  intervalMs?: number
  timeoutMs?: number
  onTick?: (snapshot: JobSnapshot) => void
  signal?: AbortSignal
}

const TERMINAL: ReadonlySet<JobStatus> = new Set(['SUCCEEDED', 'FAILED'])

export async function pollJob(
  jobId: string,
  opts: PollJobOptions = {}
): Promise<JobSnapshot> {
  const interval = opts.intervalMs ?? 2000
  const deadline = opts.timeoutMs ? Date.now() + opts.timeoutMs : Infinity

  while (true) {
    if (opts.signal?.aborted) throw new Error('Aborted')
    if (Date.now() > deadline) throw new Error('Polling timed out')

    const res = await fetch(`/api/jobs/${jobId}`, {
      method: 'GET',
      cache: 'no-store',
      signal: opts.signal,
    })
    if (!res.ok) {
      throw new Error(`Poll failed (${res.status})`)
    }
    const snapshot = (await res.json()) as JobSnapshot
    opts.onTick?.(snapshot)
    if (TERMINAL.has(snapshot.status)) return snapshot

    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, interval)
      opts.signal?.addEventListener('abort', () => {
        clearTimeout(t)
        reject(new Error('Aborted'))
      })
    })
  }
}
