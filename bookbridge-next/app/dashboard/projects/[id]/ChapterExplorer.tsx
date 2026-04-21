'use client'

import { useState } from 'react'
import { FileText, CheckCircle, Clock, Loader2, Sparkles } from 'lucide-react'
import TranslateButton from './TranslateButton'

interface ChapterData {
  id: string
  number: number
  title: string
  startPage: number
  endPage: number
  sourceContent: string | null
  translation: string | null
  summary: string | null
}

interface JobData {
  id: string
  chapterId: string | null
  status: string
}

export default function ChapterExplorer({
  chapters,
  jobs,
  projectId,
}: {
  chapters: ChapterData[]
  jobs: JobData[]
  projectId: string
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    chapters[0]?.id ?? null
  )
  const [summarizing, setSummarizing] = useState(false)
  const [summaries, setSummaries] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    for (const c of chapters) {
      if (c.summary) map[c.id] = c.summary
    }
    return map
  })

  const selected = chapters.find((c) => c.id === selectedId)
  const hasMissingSummaries = chapters.some(
    (c) => c.sourceContent && !summaries[c.id]
  )

  async function handleGenerateSummaries() {
    setSummarizing(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/summarize`, {
        method: 'POST',
      })
      if (res.ok) {
        const data = await res.json()
        const newSummaries = { ...summaries }
        for (const r of data.results ?? []) {
          newSummaries[r.chapterId] = r.summary
        }
        setSummaries(newSummaries)
      }
    } catch {
      // Best effort
    } finally {
      setSummarizing(false)
    }
  }

  function getChapterStatus(chapter: ChapterData) {
    if (chapter.translation) return 'translated'
    const job = jobs.find((j) => j.chapterId === chapter.id)
    if (job?.status === 'PROCESSING' || job?.status === 'RUNNING' || job?.status === 'PENDING')
      return 'translating'
    if (job?.status === 'QUEUED') return 'queued'
    return 'pending'
  }

  if (chapters.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
        <p className="mt-4 text-sm text-ink-muted">
          Scanning chapters from your PDF...
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          This may take a moment for large files.
        </p>
      </div>
    )
  }

  const translatedCount = chapters.filter((c) => c.translation).length

  return (
    <div className="flex gap-6">
      {/* Sidebar: chapter list */}
      <div className="w-72 shrink-0">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted">
            Chapters
          </p>
          <span className="text-xs text-ink-muted">
            {translatedCount}/{chapters.length} translated
          </span>
        </div>
        {hasMissingSummaries && (
          <button
            onClick={handleGenerateSummaries}
            disabled={summarizing}
            className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-accent/30 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/5 disabled:opacity-50"
          >
            {summarizing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {summarizing ? 'Generating...' : 'Generate Summaries'}
          </button>
        )}
        <div className="space-y-1">
          {chapters.map((chapter) => {
            const status = getChapterStatus(chapter)
            const isSelected = chapter.id === selectedId
            return (
              <button
                key={chapter.id}
                onClick={() => setSelectedId(chapter.id)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                  isSelected
                    ? 'bg-accent/10 text-accent'
                    : 'text-ink-light hover:bg-parchment/50 hover:text-ink'
                }`}
              >
                {status === 'translated' ? (
                  <CheckCircle className="h-4 w-4 shrink-0 text-green-500" />
                ) : status === 'translating' ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-purple-500" />
                ) : status === 'queued' ? (
                  <Clock className="h-4 w-4 shrink-0 text-yellow-500" />
                ) : (
                  <FileText className="h-4 w-4 shrink-0 text-ink-muted" />
                )}
                <div className="min-w-0 flex-1">
                  <p className={`truncate font-medium ${isSelected ? 'text-accent' : ''}`}>
                    {chapter.number}. {chapter.title}
                  </p>
                  <p className="text-xs text-ink-muted">
                    pp. {chapter.startPage}–{chapter.endPage}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Content preview panel */}
      <div className="min-w-0 flex-1 rounded-xl border border-parchment bg-white p-6">
        {selected ? (
          <>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-widest text-accent">
                  Chapter {selected.number}
                </p>
                <h3 className="mt-1 font-serif text-xl font-bold text-ink">
                  {selected.title}
                </h3>
                <p className="mt-1 text-xs text-ink-muted">
                  Pages {selected.startPage}–{selected.endPage}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {selected.translation ? (
                  <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                    Translated
                  </span>
                ) : (
                  <TranslateButton
                    projectId={projectId}
                    chapterId={selected.id}
                  />
                )}
              </div>
            </div>

            {(summaries[selected.id] || selected.summary) && (
              <div className="mt-4 rounded-lg bg-highlight/30 p-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-ink-muted">
                  Summary
                </p>
                <p className="mt-1 text-sm leading-relaxed text-ink-light">
                  {summaries[selected.id] || selected.summary}
                </p>
              </div>
            )}

            <div className="mt-6">
              {selected.translation ? (
                <div className="grid gap-6 md:grid-cols-2">
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-ink-muted">
                      Original
                    </p>
                    <div className="max-h-96 overflow-y-auto whitespace-pre-wrap font-serif text-sm leading-relaxed text-ink">
                      {selected.sourceContent || (
                        <span className="italic text-ink-muted">No content</span>
                      )}
                    </div>
                  </div>
                  <div className="rounded-xl bg-accent-light/30 p-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-accent">
                      Translation
                    </p>
                    <div className="max-h-96 overflow-y-auto whitespace-pre-wrap font-serif text-sm leading-relaxed text-ink">
                      {selected.translation}
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-ink-muted">
                    Source text
                  </p>
                  <div className="max-h-[500px] overflow-y-auto whitespace-pre-wrap font-serif text-sm leading-relaxed text-ink">
                    {selected.sourceContent || (
                      <span className="italic text-ink-muted">
                        No content available for this chapter.
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-ink-muted">Select a chapter to preview.</p>
        )}
      </div>
    </div>
  )
}
