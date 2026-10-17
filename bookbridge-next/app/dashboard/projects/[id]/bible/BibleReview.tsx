'use client'

import { useEffect, useState } from 'react'
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

// One page of a group (characters, or places and terms) plus where to resume.
export type EntryPage = {
  entries: BibleEntry[]
  total: number
  nextCursor: string | null
}

type Group = 'person' | 'other'

type Bible = {
  status: string
  scanStatus: string
  styleGuide: string
  jobId: string | null
} | null

export type TermPatch = Partial<{
  translation: string
  gender: string | null
  voice: string | null
}>

const REVIEW_LABEL: Record<string, string> = {
  DRAFT: 'Draft — review, then confirm',
  CONFIRMED: 'Confirmed',
}

function headline(status: string | null, scanStatus: string | null): string {
  if (status && REVIEW_LABEL[status]) return REVIEW_LABEL[status]
  if (scanStatus === 'SCANNING') return 'Scanning…'
  if (scanStatus === 'FAILED') return 'Scan failed — try again'
  return 'Not scanned yet'
}

function detail(reviewable: boolean, scanStatus: string | null): string {
  if (!reviewable) {
    return 'Scan the whole book once to collect characters, aliases, voices and a style guide. Translating without it still works.'
  }
  if (scanStatus === 'SCANNING') return 'Re-scanning — the current bible stays in use until the scan finishes.'
  if (scanStatus === 'FAILED') return 'The last scan failed — the current bible is still in use.'
  return 'Translation uses the bible as soon as a draft exists. Aliases are translated as written — the main name is only a hint.'
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
  people: initialPeople,
  others: initialOthers,
}: {
  projectId: string
  bible: Bible
  people: EntryPage
  others: EntryPage
}) {
  const router = useRouter()
  const [status, setStatus] = useState(bible?.status ?? null)
  const [scanStatus, setScanStatus] = useState(bible?.scanStatus ?? null)
  const [styleGuide, setStyleGuide] = useState(bible?.styleGuide ?? '')
  const [savedStyle, setSavedStyle] = useState(bible?.styleGuide ?? '')
  const [groups, setGroups] = useState<Record<Group, EntryPage>>({
    person: initialPeople,
    other: initialOthers,
  })
  const [query, setQuery] = useState('')
  // The filter the shown pages were loaded with ('' = none).
  const [activeQuery, setActiveQuery] = useState('')
  const [loadingGroup, setLoadingGroup] = useState<Group | 'all' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Resume polling when the page is opened while a scan is running.
  useEffect(() => {
    if (bible?.scanStatus !== 'SCANNING' || !bible.jobId) return
    const controller = new AbortController()
    pollJob(bible.jobId, { signal: controller.signal, timeoutMs: SCAN_POLL_TIMEOUT_MS })
      .then(() => router.refresh())
      .catch(() => {})
    return () => controller.abort()
  }, [bible?.scanStatus, bible?.jobId, router])

  const scanning = scanStatus === 'SCANNING' || busy
  const reviewable = status === 'DRAFT' || status === 'CONFIRMED'

  const people = groups.person
  const others = groups.other

  function entriesUrl(group: Group, q: string, cursor?: string) {
    const params = new URLSearchParams({ group })
    if (q) params.set('q', q)
    if (cursor) params.set('cursor', cursor)
    return `/api/projects/${projectId}/bible/entries?${params}`
  }

  async function fetchPage(group: Group, q: string, cursor?: string): Promise<EntryPage> {
    const res = await fetch(entriesUrl(group, q, cursor))
    if (!res.ok) throw new Error('Could not load the bible')
    const body = (await res.json()) as { data: BibleEntry[]; total: number; nextCursor: string | null }
    return { entries: body.data, total: body.total, nextCursor: body.nextCursor }
  }

  async function search(e: React.FormEvent) {
    e.preventDefault()
    const q = query.trim()
    setLoadingGroup('all')
    await run(async () => {
      const [person, other] = await Promise.all([fetchPage('person', q), fetchPage('other', q)])
      setGroups({ person, other })
      setActiveQuery(q)
    })
    setLoadingGroup(null)
  }

  async function showMore(group: Group) {
    const cursor = groups[group].nextCursor
    if (!cursor) return
    setLoadingGroup(group)
    await run(async () => {
      const page = await fetchPage(group, activeQuery, cursor)
      setGroups((g) => ({
        ...g,
        [group]: { ...page, entries: [...g[group].entries, ...page.entries] },
      }))
    })
    setLoadingGroup(null)
  }

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
      reviewable &&
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
      setScanStatus('SCANNING')
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
    const apply = (page: EntryPage) => ({
      ...page,
      entries: page.entries.map((e) => (e.id === id ? change(e) : e)),
    })
    setGroups((g) => ({ person: apply(g.person), other: apply(g.other) }))
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
          <p className="text-sm font-semibold text-ink">{headline(status, scanStatus)}</p>
          <p className="mt-0.5 text-xs text-ink-muted">{detail(reviewable, scanStatus)}</p>
        </div>
        <div className="flex gap-2">
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

          <form onSubmit={search} className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search names or aliases, then press Enter"
              aria-label="Search names or aliases"
              maxLength={100}
              className="w-full rounded border border-zinc-300 bg-white py-1.5 pl-8 pr-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            {loadingGroup === 'all' && (
              <Loader2 className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-zinc-400" />
            )}
          </form>

          <section>
            <h2 className="text-sm font-semibold text-ink">Characters ({people.total})</h2>
            <div className="mt-2 grid gap-3 lg:grid-cols-2">
              {people.entries.map((e) => (
                <EntryCard key={e.id} {...cardProps(e)} person />
              ))}
            </div>
            <ShowMore
              page={people}
              label="characters"
              loading={loadingGroup === 'person'}
              onClick={() => showMore('person')}
            />
          </section>

          <section>
            <h2 className="text-sm font-semibold text-ink">Places and terms ({others.total})</h2>
            <div className="mt-2 grid gap-3 lg:grid-cols-2">
              {others.entries.map((e) => (
                <EntryCard key={e.id} {...cardProps(e)} person={false} />
              ))}
            </div>
            <ShowMore
              page={others}
              label="places and terms"
              loading={loadingGroup === 'other'}
              onClick={() => showMore('other')}
            />
          </section>
        </>
      )}
    </div>
  )
}

function ShowMore({
  page,
  label,
  loading,
  onClick,
}: {
  page: EntryPage
  label: string
  loading: boolean
  onClick: () => void
}) {
  if (!page.nextCursor) return null
  const left = page.total - page.entries.length
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      aria-label={`Show more ${label}`}
      className={`mt-3 ${secondary}`}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      Show more{left > 0 ? ` (${left} left)` : ''}
    </button>
  )
}
