'use client'

import { useState } from 'react'
import { AlertTriangle, XCircle } from 'lucide-react'
import type { ReaderRow } from '@/lib/reader'

export type ViewMode = 'bilingual' | 'translation' | 'source'

const TEXT = 'font-serif text-[15px] leading-[1.9] text-ink whitespace-pre-wrap'

// One source paragraph. In bilingual mode source and translation share a
// row, so they stay aligned however long either side is.
export default function SegmentRow({
  row,
  mode,
  showIssues,
  anchorId,
  highlighted = false,
}: {
  row: ReaderRow
  mode: ViewMode
  showIssues: boolean
  anchorId: string
  highlighted?: boolean
}) {
  const [issuesOpen, setIssuesOpen] = useState(false)
  const issues = showIssues ? (row.issues ?? []) : []
  const flagged = showIssues && row.status === 'flagged' && issues.length > 0

  const source = <p className={TEXT}>{row.source}</p>
  const translation = (
    <div>
      {row.translation ? (
        <p className={TEXT}>{row.translation}</p>
      ) : (
        <p className="font-serif text-[15px] italic text-ink-muted">Not yet translated</p>
      )}
      {row.status === 'failed' && (
        <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
          <XCircle className="h-3.5 w-3.5" /> Translation failed — retranslate this chapter
        </p>
      )}
      {flagged && (
        <button
          type="button"
          onClick={() => setIssuesOpen((o) => !o)}
          aria-expanded={issuesOpen}
          aria-label={`Review issues for paragraph ${row.index + 1}`}
          className="mt-1 inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 hover:bg-amber-200"
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          {issues.length} issue{issues.length !== 1 ? 's' : ''}
        </button>
      )}
      {flagged && issuesOpen && (
        <ul className="mt-2 space-y-1 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-ink">
          {issues.map((issue, i) => (
            <li key={i}>
              <span
                className={`mr-1 font-semibold ${issue.severity === 'error' ? 'text-red-700' : 'text-amber-700'}`}
              >
                {issue.category}
              </span>
              {issue.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  )

  const ring = highlighted ? 'rounded-md bg-highlight/60 ring-2 ring-accent/40' : ''
  const flagBorder = flagged ? 'border-l-2 border-amber-400 pl-3' : ''

  return (
    <div id={anchorId} className={`scroll-mt-20 py-2 ${ring} ${flagBorder}`}>
      {mode === 'bilingual' && (
        <div className="grid gap-2 md:grid-cols-2 md:gap-8">
          {source}
          <div className="rounded-md bg-accent-light/30 px-3 md:bg-transparent md:px-0">
            {translation}
          </div>
        </div>
      )}
      {mode === 'translation' && translation}
      {mode === 'source' && source}
    </div>
  )
}
