'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, Loader2, RefreshCw, Square } from 'lucide-react'
import { pollJob } from '@/lib/jobPoll'
import { scanEstimate } from '@/lib/bible-scan'

type Bible = {
  status: string
  scanStatus: string
  styleGuide: string
  jobId: string | null
  // Live scan progress (steps done / total) and whether the scan went silent.
  scanDone?: number
  scanTotal?: number
  scanLost?: boolean
} | null

const REVIEW_LABEL: Record<string, string> = {
  DRAFT: 'Draft — review, then confirm',
  CONFIRMED: 'Confirmed',
}

function headline(status: string | null, scanStatus: string | null, lost: boolean): string {
  if (lost) return 'Scan stopped responding'
  if (status && REVIEW_LABEL[status]) return REVIEW_LABEL[status]
  if (scanStatus === 'SCANNING') return 'Scanning…'
  if (scanStatus === 'FAILED') return 'Scan failed — try again'
  return 'Not scanned yet'
}

function detail(reviewable: boolean, scanStatus: string | null, lost: boolean): string {
  if (lost) return 'No progress for 10 minutes — the scan was probably interrupted. Start it again.'
  if (!reviewable) {
    return 'Optional: scan the whole book to draft notes on the storyline, main characters and tone, and to fill the glossary with names.'
  }
  if (scanStatus === 'SCANNING') return 'Re-scanning — the current bible stays in use until the scan finishes.'
  if (scanStatus === 'FAILED') return 'The last scan failed — the current bible is still in use.'
  return 'The scan drafted the notes below. Edit them freely; a re-scan keeps your edits.'
}

// Scans of long books can take half an hour or more.
const SCAN_POLL_TIMEOUT_MS = 60 * 60 * 1000
// How often the page refreshes the progress of a running scan.
const PROGRESS_POLL_MS = 5000

// How long and how costly a scan is, sized to the book when its length is known.
function scanCostNote(sourceChars: number): string {
  const size =
    sourceChars > 0
      ? (() => {
          const { calls, minMinutes, maxMinutes } = scanEstimate(sourceChars)
          return `for this book about ${calls} model calls, roughly ${minMinutes}–${maxMinutes} minutes`
        })()
      : 'a full novel takes dozens of model calls and 15–30 minutes or more'
  return `Scanning reads the whole book with the model, one passage at a time — ${size}, billed to the API key in use. Translating works without a bible, so only scan if you plan to translate most of the book.`
}

const button =
  'inline-flex items-center gap-1 rounded px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50'
const primary = `${button} bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900`
const secondary = `${button} border border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900`

export default function BibleReview({
  projectId,
  bible,
  sourceChars = 0,
}: {
  projectId: string
  bible: Bible
  sourceChars?: number
}) {
  const router = useRouter()
  const [status, setStatus] = useState(bible?.status ?? null)
  const [scanStatus, setScanStatus] = useState(bible?.scanStatus ?? null)
  // The translation notes are stored in the bible's styleGuide field.
  const [overview, setOverview] = useState(bible?.styleGuide ?? '')
  const [savedOverview, setSavedOverview] = useState(bible?.styleGuide ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState({ done: bible?.scanDone ?? 0, total: bible?.scanTotal ?? 0 })
  const [lost, setLost] = useState(bible?.scanLost ?? false)

  // Resume polling when the page is opened while a scan is running.
  useEffect(() => {
    if (bible?.scanStatus !== 'SCANNING' || !bible.jobId) return
    const controller = new AbortController()
    pollJob(bible.jobId, { signal: controller.signal, timeoutMs: SCAN_POLL_TIMEOUT_MS })
      .then(() => router.refresh())
      .catch(() => {})
    return () => controller.abort()
  }, [bible?.scanStatus, bible?.jobId, router])

  const running = scanStatus === 'SCANNING' && !lost
  const scanning = running || busy
  const reviewable = status === 'DRAFT' || status === 'CONFIRMED'

  // While a scan runs, refresh its progress; when it ends, reload the page data.
  useEffect(() => {
    if (!running) return
    let stopped = false
    async function refresh() {
      try {
        const res = await fetch(`/api/projects/${projectId}/bible`, { cache: 'no-store' })
        const body = (await res.json()) as { bible: NonNullable<Bible> | null }
        if (stopped || !body.bible) return
        setProgress({ done: body.bible.scanDone ?? 0, total: body.bible.scanTotal ?? 0 })
        setLost(body.bible.scanLost ?? false)
        if (body.bible.scanStatus !== 'SCANNING') {
          setScanStatus(body.bible.scanStatus)
          router.refresh()
        }
      } catch {
        // a missed refresh is fine; the next one catches up
      }
    }
    refresh()
    const timer = setInterval(refresh, PROGRESS_POLL_MS)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [running, projectId, router])

  async function call(url: string, init: RequestInit, failure: string) {
    const res = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json' },
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || failure)
    }
    return res.status === 204 ? null : res.json()
  }

  async function run(action: () => Promise<void>) {
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    }
  }

  async function scan() {
    const keep = reviewable
      ? ' Your edits to the overview and to glossary names are kept.'
      : ''
    if (!window.confirm(`${scanCostNote(sourceChars)}${keep}\n\nStart the scan?`)) return
    setBusy(true)
    setLost(false)
    setProgress({ done: 0, total: 0 })
    await run(async () => {
      const job = await call(
        `/api/projects/${projectId}/bible/scan`,
        { method: 'POST' },
        'Could not start the scan'
      )
      setScanStatus('SCANNING')
      await pollJob(job.id, { timeoutMs: SCAN_POLL_TIMEOUT_MS })
      router.refresh()
    })
    setBusy(false)
  }

  async function stopScan() {
    if (!window.confirm('Stop the scan? Work done so far is discarded; the current bible stays as it is.')) {
      return
    }
    await run(async () => {
      await call(`/api/projects/${projectId}/bible/scan`, { method: 'DELETE' }, 'Could not stop the scan')
      setScanStatus('IDLE')
      setProgress({ done: 0, total: 0 })
      router.refresh()
    })
  }

  async function saveBible(patch: { styleGuide?: string; status?: 'CONFIRMED' | 'DRAFT' }) {
    await run(async () => {
      const body = await call(
        `/api/projects/${projectId}/bible`,
        { method: 'PATCH', body: JSON.stringify(patch) },
        'Could not save the bible'
      )
      setStatus(body.bible.status)
      setSavedOverview(body.bible.styleGuide)
    })
  }

  return (
    <div className="space-y-6">
      {error && (
        <div
          role="alert"
          className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <div>
          <p className="text-sm font-semibold text-ink">{headline(status, scanStatus, lost)}</p>
          <p className="mt-0.5 text-xs text-ink-muted">{detail(reviewable, scanStatus, lost)}</p>
        </div>
        <div className="flex gap-2">
          {running && (
            <button type="button" onClick={stopScan} className={secondary}>
              <Square className="h-4 w-4" />
              Stop scan
            </button>
          )}
          <button type="button" onClick={scan} disabled={scanning} className={secondary}>
            {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {scanning ? 'Scanning…' : reviewable || scanStatus === 'FAILED' ? 'Re-scan' : 'Scan book'}
          </button>
          {status === 'DRAFT' && (
            <button type="button" onClick={() => saveBible({ status: 'CONFIRMED' })} className={primary}>
              <CheckCircle2 className="h-4 w-4" />
              Confirm bible
            </button>
          )}
          {status === 'CONFIRMED' && (
            <button type="button" onClick={() => saveBible({ status: 'DRAFT' })} className={secondary}>
              Reopen as draft
            </button>
          )}
        </div>
        {running && <ScanProgress done={progress.done} total={progress.total} />}
        {!scanning && (
          <p role="note" className="basis-full rounded bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            {scanCostNote(sourceChars)}
          </p>
        )}
      </div>

      <section>
        <h2 className="text-sm font-semibold text-ink">Translation notes</h2>
        <p className="mt-0.5 text-xs text-ink-muted">
          How you want this book translated: tone, style, what to keep as is. Sent with every
          passage. Names and their translations are in the{' '}
          <Link href={`/dashboard/projects/${projectId}/glossary`} className="underline">
            glossary
          </Link>
          .
        </p>
        <textarea
          aria-label="Translation notes"
          value={overview}
          onChange={(e) => setOverview(e.target.value)}
          onBlur={() => overview !== savedOverview && saveBible({ styleGuide: overview })}
          maxLength={5000}
          rows={14}
          placeholder={'e.g. Keep the dialogue casual. Leave Korean honorifics (hyung, sunbae) as they are.'}
          className="mt-2 w-full rounded border border-zinc-300 bg-white p-2 text-sm leading-relaxed dark:border-zinc-700 dark:bg-zinc-950"
        />
      </section>
    </div>
  )
}

function ScanProgress({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <div className="basis-full">
      <div
        role="progressbar"
        aria-label="Scan progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
      >
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs text-ink-muted">
        {total > 0 ? `${done} / ${total} steps (${pct}%)` : 'Starting…'}
      </p>
    </div>
  )
}
