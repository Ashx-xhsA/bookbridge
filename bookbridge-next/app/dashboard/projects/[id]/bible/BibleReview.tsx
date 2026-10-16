'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2, RefreshCw, Search } from 'lucide-react'
import { pollJob } from '@/lib/jobPoll'
import EntryCard, { type AliasRow } from './EntryCard'

export type BibleEntry = {
  id: string
  english: string
  translation: string | null
  category: string
  gender: string | null
  voice: string | null
  mentions: number
  approved: boolean
  userEdited: boolean
  aliases: AliasRow[]
}

type Bible = { status: string; styleGuide: string; jobId: string | null } | null

export type TermPatch = Partial<{
  translation: string
  gender: string | null
  voice: string | null
}>

const STATUS_LABEL: Record<string, string> = {
  SCANNING: 'Scanning…',
  DRAFT: 'Draft — review, then confirm',
  CONFIRMED: 'Confirmed',
  FAILED: 'Scan failed — try again',
}

// Scans of long books can take several minutes.
const SCAN_POLL_TIMEOUT_MS = 30 * 60 * 1000

const button =
  'inline-flex items-center gap-1 rounded px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50'
const primary = `${button} bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900`
const secondary = `${button} border border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900`

export default function BibleReview({
  projectId,
  bible,
  entries: initialEntries,
}: {
  projectId: string
  bible: Bible
  entries: BibleEntry[]
}) {
  const router = useRouter()
  const [status, setStatus] = useState(bible?.status ?? null)
  const [styleGuide, setStyleGuide] = useState(bible?.styleGuide ?? '')
  const [savedStyle, setSavedStyle] = useState(bible?.styleGuide ?? '')
  const [entries, setEntries] = useState(initialEntries)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Resume polling when the page is opened while a scan is running.
  useEffect(() => {
    if (bible?.status !== 'SCANNING' || !bible.jobId) return
    const controller = new AbortController()
    pollJob(bible.jobId, { signal: controller.signal, timeoutMs: SCAN_POLL_TIMEOUT_MS })
      .then(() => router.refresh())
      .catch(() => {})
    return () => controller.abort()
  }, [bible?.status, bible?.jobId, router])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return entries
    return entries.filter(
      (e) =>
        e.english.toLowerCase().includes(q) ||
        (e.translation ?? '').includes(q) ||
        e.aliases.some((a) => a.english.toLowerCase().includes(q))
    )
  }, [entries, query])
  const people = visible.filter((e) => e.category === 'person')
  const others = visible.filter((e) => e.category !== 'person')

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
    if (
      status &&
      !window.confirm(
        'Re-scan the whole book? Names you have not edited or approved will be updated; your edits are kept.'
      )
    )
      return
    setBusy(true)
    await run(async () => {
      const job = await call(
        `/api/projects/${projectId}/bible/scan`,
        { method: 'POST' },
        'Could not start the scan'
      )
      setStatus('SCANNING')
      await pollJob(job.id, { timeoutMs: SCAN_POLL_TIMEOUT_MS })
      router.refresh()
    })
    setBusy(false)
  }

  async function saveBible(patch: { styleGuide?: string; status?: 'CONFIRMED' | 'DRAFT' }) {
    await run(async () => {
      const body = await call(
        `/api/projects/${projectId}/bible`,
        { method: 'PATCH', body: JSON.stringify(patch) },
        'Could not save the bible'
      )
      setStatus(body.bible.status)
      setSavedStyle(body.bible.styleGuide)
    })
  }

  function updateEntry(id: string, change: (e: BibleEntry) => BibleEntry) {
    setEntries((prev) => prev.map((e) => (e.id === id ? change(e) : e)))
  }

  async function patchTerm(entryId: string, termId: string, patch: TermPatch) {
    await run(async () => {
      await call(
        `/api/projects/${projectId}/glossary/${termId}`,
        { method: 'PATCH', body: JSON.stringify(patch) },
        'Could not save the change'
      )
      updateEntry(entryId, (e) =>
        termId === e.id
          ? { ...e, ...patch, userEdited: true }
          : {
              ...e,
              aliases: e.aliases.map((a) => (a.id === termId ? { ...a, ...patch } : a)),
            }
      )
    })
  }

  async function deleteAlias(entryId: string, aliasId: string) {
    await run(async () => {
      await call(
        `/api/projects/${projectId}/glossary/${aliasId}`,
        { method: 'DELETE' },
        'Could not delete the alias'
      )
      updateEntry(entryId, (e) => ({ ...e, aliases: e.aliases.filter((a) => a.id !== aliasId) }))
    })
  }

  async function addAlias(entry: BibleEntry, english: string, translation: string) {
    await run(async () => {
      const body = await call(
        `/api/projects/${projectId}/glossary`,
        {
          method: 'POST',
          body: JSON.stringify({ english, translation, category: entry.category, aliasOfId: entry.id }),
        },
        'Could not add the alias'
      )
      const { id, english: name, translation: tr } = body.data
      updateEntry(entry.id, (e) => ({
        ...e,
        aliases: [...e.aliases, { id, english: name, translation: tr }],
      }))
    })
  }

  const cardProps = (e: BibleEntry) => ({
    entry: e,
    onPatch: (termId: string, patch: TermPatch) => patchTerm(e.id, termId, patch),
    onDeleteAlias: (aliasId: string) => deleteAlias(e.id, aliasId),
    onAddAlias: (english: string, translation: string) => addAlias(e, english, translation),
  })

  const scanning = status === 'SCANNING' || busy
  const reviewable = status === 'DRAFT' || status === 'CONFIRMED'

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
          <p className="text-sm font-semibold text-ink">
            {status ? STATUS_LABEL[status] : 'Not scanned yet'}
          </p>
          <p className="mt-0.5 text-xs text-ink-muted">
            {status
              ? 'Translation uses the bible as soon as a draft exists. Aliases are translated as written — the main name is only a hint.'
              : 'Scan the whole book once to collect characters, aliases, voices and a style guide. Translating without it still works.'}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={scan} disabled={scanning} className={secondary}>
            {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {scanning ? 'Scanning…' : status ? 'Re-scan' : 'Scan book'}
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
      </div>

      {reviewable && (
        <>
          <section>
            <h2 className="text-sm font-semibold text-ink">Style guide</h2>
            <textarea
              aria-label="Style guide"
              value={styleGuide}
              onChange={(e) => setStyleGuide(e.target.value)}
              onBlur={() => styleGuide !== savedStyle && saveBible({ styleGuide })}
              maxLength={5000}
              rows={6}
              className="mt-2 w-full rounded border border-zinc-300 bg-white p-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
          </section>

          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search names or aliases"
              aria-label="Search names or aliases"
              className="w-full rounded border border-zinc-300 bg-white py-1.5 pl-8 pr-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>

          <section>
            <h2 className="text-sm font-semibold text-ink">Characters ({people.length})</h2>
            <div className="mt-2 grid gap-3 lg:grid-cols-2">
              {people.map((e) => (
                <EntryCard key={e.id} {...cardProps(e)} person />
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-ink">Places and terms ({others.length})</h2>
            <div className="mt-2 grid gap-3 lg:grid-cols-2">
              {others.map((e) => (
                <EntryCard key={e.id} {...cardProps(e)} person={false} />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
