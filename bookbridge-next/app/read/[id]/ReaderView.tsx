'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { CheckCircle, FileText, Search, X, Loader2 } from 'lucide-react'
import { pollJob } from '@/lib/jobPoll'
import {
  SEARCH_QUERY_MIN,
  chapterUrl,
  makeSnippet,
  searchUrl,
  type ChapterSource,
  type ReaderChapter,
  type ReaderRow,
  type SearchHit,
} from '@/lib/reader'
import SegmentRow, { type ViewMode } from './SegmentRow'

export type { ReaderChapter }

const MODE_LABELS: Record<ViewMode, string> = {
  bilingual: 'Bilingual',
  translation: 'Translation Only',
  source: 'Source Only',
}

const MODE_KEY = 'bookbridge-reader-mode'

function readSavedMode(): ViewMode {
  try {
    const saved = typeof window === 'undefined' ? null : localStorage.getItem(MODE_KEY)
    if (saved === 'bilingual' || saved === 'translation' || saved === 'source') return saved
  } catch {
    // storage blocked: fall back to the default
  }
  return 'bilingual'
}

function anchorId(key: string, index: number) {
  return `seg-${key}-${index}`
}

// Search the demo's in-memory rows (no server behind the static demo).
function localSearch(
  chapters: ReaderChapter[],
  rows: Record<string, ReaderRow[]>,
  query: string
): SearchHit[] {
  const q = query.toLowerCase()
  return chapters.flatMap((ch) =>
    (rows[ch.key] ?? []).flatMap((r) => {
      const text = [r.source, r.translation ?? ''].find((t) => t.toLowerCase().includes(q))
      return text === undefined
        ? []
        : [{ chapterId: ch.key, chapterNumber: ch.number, chapterTitle: ch.title, index: r.index, snippet: makeSnippet(text, query) }]
    })
  )
}

export default function ReaderView({
  title,
  subtitle,
  sourceLang = 'English',
  targetLang = 'Translation',
  chapters,
  initialRows,
  source,
  isDemo,
}: {
  title: string
  subtitle?: string
  sourceLang?: string
  targetLang?: string
  chapters: ReaderChapter[]
  initialRows: Record<string, ReaderRow[]>
  source: ChapterSource
  isDemo?: boolean
}) {
  const [mode, setMode] = useState<ViewMode>(readSavedMode)
  const [rows, setRows] = useState<Record<string, ReaderRow[]>>(initialRows)
  const [loading, setLoading] = useState<Set<string>>(new Set())
  const [loadFailed, setLoadFailed] = useState<Set<string>>(new Set())
  const [doneKeys, setDoneKeys] = useState<Set<string>>(
    () => new Set(chapters.filter((c) => c.done).map((c) => c.key))
  )
  const [translating, setTranslating] = useState<Set<string>>(new Set())
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [highlight, setHighlight] = useState<{ key: string; index: number } | null>(null)
  // Chapters already on the page and requests in flight, readable from the
  // stable loadChapter callback without re-creating it on every load.
  const loaded = useRef<Set<string>>(new Set(Object.keys(initialRows)))
  const inFlight = useRef<Set<string>>(new Set())

  const isOwner = source.kind === 'owner'

  const loadChapter = useCallback(
    async (ch: ReaderChapter, force = false) => {
      if (!force && loaded.current.has(ch.key)) return
      const url = ch.id ? chapterUrl(source, ch.id) : null
      if (!url || inFlight.current.has(ch.key)) return
      inFlight.current.add(ch.key)
      setLoading((s) => new Set(s).add(ch.key))
      try {
        const res = await fetch(url)
        if (!res.ok) throw new Error('load failed')
        const body = (await res.json()) as { data?: { segments?: ReaderRow[] } }
        const segments = body.data?.segments ?? []
        loaded.current.add(ch.key)
        setRows((r) => ({ ...r, [ch.key]: segments }))
        setLoadFailed((s) => {
          const next = new Set(s)
          next.delete(ch.key)
          return next
        })
      } catch {
        setLoadFailed((s) => new Set(s).add(ch.key))
      } finally {
        inFlight.current.delete(ch.key)
        setLoading((s) => {
          const next = new Set(s)
          next.delete(ch.key)
          return next
        })
      }
    },
    [source]
  )

  // Scroll to a search hit once its chapter's rows are on the page.
  useEffect(() => {
    if (!highlight || !rows[highlight.key]) return
    document.getElementById(anchorId(highlight.key, highlight.index))?.scrollIntoView?.({
      behavior: 'smooth',
      block: 'center',
    })
  }, [highlight, rows])

  function handleModeChange(newMode: ViewMode) {
    setMode(newMode)
    try {
      localStorage.setItem(MODE_KEY, newMode)
    } catch {
      // storage blocked: the mode just isn't remembered
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (q.length < SEARCH_QUERY_MIN) return
    if (source.kind === 'static') {
      setHits(localSearch(chapters, rows, q))
      return
    }
    const url = searchUrl(source, q)
    if (!url) return
    setSearching(true)
    try {
      const res = await fetch(url)
      const body = res.ok ? ((await res.json()) as { data?: SearchHit[] }) : {}
      setHits(body.data ?? [])
    } catch {
      setHits([])
    } finally {
      setSearching(false)
    }
  }

  function closeSearch() {
    setSearchOpen(false)
    setQuery('')
    setHits(null)
    setHighlight(null)
  }

  async function jumpTo(hit: SearchHit) {
    const ch = chapters.find((c) => c.key === hit.chapterId)
    if (!ch) return
    setHighlight({ key: ch.key, index: hit.index })
    await loadChapter(ch)
  }

  async function handleTranslate(ch: ReaderChapter) {
    if (source.kind !== 'owner' || !ch.id || translating.has(ch.key)) return
    setTranslating((s) => new Set(s).add(ch.key))
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: source.projectId, chapterId: ch.id }),
      })
      if (!res.ok) return
      const body = (await res.json()) as { id?: string }
      if (!body.id) return
      const final = await pollJob(body.id)
      await loadChapter(ch, true)
      if (final.status === 'SUCCEEDED') setDoneKeys((s) => new Set(s).add(ch.key))
    } finally {
      setTranslating((s) => {
        const next = new Set(s)
        next.delete(ch.key)
        return next
      })
    }
  }

  return (
    <div className="min-h-screen bg-cream">
      <header className="sticky top-0 z-10 border-b border-parchment bg-cream/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-4">
            <Link
              href="/"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-white font-serif text-sm font-bold"
            >
              B
            </Link>
            <div className="hidden min-w-0 truncate sm:block">
              <span className="font-serif font-semibold text-ink">{title}</span>
              {subtitle && <span className="ml-2 text-sm text-ink-muted">{subtitle}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {searchOpen ? (
              <form
                onSubmit={handleSearch}
                className="flex items-center gap-1 rounded-lg border border-parchment bg-white px-2"
              >
                <Search className="h-3.5 w-3.5 text-ink-muted" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search the book…"
                  maxLength={100}
                  autoFocus
                  className="w-40 border-none bg-transparent py-1.5 text-xs outline-none placeholder:text-ink-muted"
                />
                <button type="button" onClick={closeSearch} aria-label="Close">
                  <X className="h-3.5 w-3.5 text-ink-muted hover:text-ink" />
                </button>
              </form>
            ) : (
              <button
                onClick={() => setSearchOpen(true)}
                aria-label="Search"
                className="rounded-lg border border-parchment p-2 text-ink-muted hover:text-ink"
              >
                <Search className="h-4 w-4" />
              </button>
            )}
            <div className="hidden sm:flex rounded-lg border border-parchment bg-white p-0.5">
              {(Object.keys(MODE_LABELS) as ViewMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => handleModeChange(m)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    mode === m ? 'bg-accent text-white' : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {MODE_LABELS[m]}
                </button>
              ))}
            </div>
            {isDemo && (
              <Link
                href="/sign-up"
                className="rounded-lg bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent-hover"
              >
                Sign Up
              </Link>
            )}
          </div>
        </div>
        {searchOpen && (searching || hits) && (
          <div className="mx-auto max-h-72 max-w-7xl overflow-y-auto border-t border-parchment px-4 py-2 sm:px-6">
            {searching ? (
              <p className="flex items-center gap-2 text-xs text-ink-muted">
                <Loader2 className="h-3 w-3 animate-spin" /> Searching…
              </p>
            ) : hits && hits.length === 0 ? (
              <p className="text-xs text-ink-muted">No matches.</p>
            ) : (
              <ul className="space-y-1">
                {hits?.map((hit) => (
                  <li key={`${hit.chapterId}-${hit.index}`}>
                    <button
                      onClick={() => jumpTo(hit)}
                      className="w-full rounded-md px-2 py-1 text-left text-xs hover:bg-parchment/50"
                    >
                      <span className="font-medium text-ink">
                        Chapter {hit.chapterNumber} · {hit.chapterTitle}
                      </span>{' '}
                      <span className="text-ink-muted">{hit.snippet}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </header>

      <div className="flex">
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 overflow-y-auto border-r border-parchment bg-paper/50 p-5 lg:block">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-muted">
            Contents
          </p>
          <nav className="mt-4 space-y-1">
            {chapters.map((ch) => (
              <a
                key={ch.key}
                href={`#ch-${ch.number}`}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-ink-light transition-colors hover:bg-parchment/50 hover:text-ink"
              >
                {doneKeys.has(ch.key) ? (
                  <CheckCircle className="h-3.5 w-3.5 shrink-0 text-green-500" />
                ) : (
                  <FileText className="h-3.5 w-3.5 shrink-0 text-ink-muted/40" />
                )}
                <span className="truncate">
                  <span className="text-ink-muted">{ch.number}.</span> {ch.title}
                </span>
              </a>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">
          <div className={`mx-auto px-4 py-10 sm:px-6 ${mode === 'bilingual' ? 'max-w-5xl' : 'max-w-3xl'}`}>
            <div className="mb-12 text-center">
              <h1 className="font-serif text-4xl font-bold text-ink">{title}</h1>
              {subtitle && <p className="mt-2 font-serif text-2xl text-ink-muted">{subtitle}</p>}
              <p className="mt-4 text-sm text-ink-muted">
                {sourceLang} &rarr; {targetLang} &middot; {chapters.length} chapters
              </p>
            </div>

            <div className="space-y-16">
              {chapters.map((ch) => (
                <ChapterSection
                  key={ch.key}
                  chapter={ch}
                  rows={rows[ch.key]}
                  loading={loading.has(ch.key)}
                  loadFailed={loadFailed.has(ch.key)}
                  onLoad={() => loadChapter(ch)}
                  mode={mode}
                  sourceLang={sourceLang}
                  targetLang={targetLang}
                  showIssues={isOwner}
                  canTranslate={isOwner && !!ch.id && !doneKeys.has(ch.key)}
                  translating={translating.has(ch.key)}
                  onTranslate={() => handleTranslate(ch)}
                  highlightIndex={highlight?.key === ch.key ? highlight.index : null}
                />
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

function ChapterSection({
  chapter,
  rows,
  loading,
  loadFailed,
  onLoad,
  mode,
  sourceLang,
  targetLang,
  showIssues,
  canTranslate,
  translating,
  onTranslate,
  highlightIndex,
}: {
  chapter: ReaderChapter
  rows: ReaderRow[] | undefined
  loading: boolean
  loadFailed: boolean
  onLoad: () => void
  mode: ViewMode
  sourceLang: string
  targetLang: string
  showIssues: boolean
  canTranslate: boolean
  translating: boolean
  onTranslate: () => void
  highlightIndex: number | null
}) {
  const ref = useRef<HTMLElement>(null)

  // Load a chapter's paragraphs when it scrolls near the viewport.
  useEffect(() => {
    if (rows || loadFailed || typeof IntersectionObserver === 'undefined' || !ref.current) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onLoad()
      },
      { rootMargin: '600px 0px' }
    )
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [rows, loadFailed, onLoad])

  return (
    <section ref={ref} id={`ch-${chapter.number}`} className="scroll-mt-16">
      <div className="mb-6 flex items-end justify-between gap-4 border-b border-parchment pb-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-accent">
            Chapter {chapter.number}
          </p>
          <h2 className="mt-1 font-serif text-2xl font-bold text-ink">{chapter.title}</h2>
        </div>
        {canTranslate && (
          <button
            onClick={onTranslate}
            disabled={translating}
            className="inline-flex shrink-0 items-center gap-1 rounded-md bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {translating ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" /> Translating…
              </>
            ) : (
              'Translate'
            )}
          </button>
        )}
      </div>

      {mode === 'bilingual' && rows && rows.length > 0 && (
        <div className="mb-2 hidden grid-cols-2 gap-8 md:grid">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-muted">
            {sourceLang}
          </p>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-accent">
            {targetLang}
          </p>
        </div>
      )}

      {rows ? (
        rows.length > 0 ? (
          <div className="divide-y divide-parchment/60">
            {rows.map((row) => (
              <SegmentRow
                key={row.index}
                row={row}
                mode={mode}
                showIssues={showIssues}
                anchorId={anchorId(chapter.key, row.index)}
                highlighted={highlightIndex === row.index}
              />
            ))}
          </div>
        ) : (
          <p className="italic text-ink-muted">Content not available</p>
        )
      ) : loading ? (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </p>
      ) : (
        <button
          onClick={onLoad}
          aria-label={`Load chapter ${chapter.number}`}
          className="rounded-md border border-parchment px-3 py-1.5 text-sm text-ink-muted hover:text-ink"
        >
          {loadFailed ? 'Could not load this chapter — try again' : 'Load chapter'}
        </button>
      )}
    </section>
  )
}
