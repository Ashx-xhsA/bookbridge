'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'

const EXPORTS = [
  { query: 'format=md&layout=translation', label: 'Markdown — translation' },
  { query: 'format=md&layout=bilingual', label: 'Markdown — bilingual' },
  { query: 'format=epub&layout=side', label: 'EPUB — side by side' },
  {
    query: 'format=epub&layout=stacked',
    label: 'EPUB — paragraph by paragraph',
  },
]

// Owner-only downloads, built on the server from the whole book. The reader
// shows an icon; the project page shows it labelled so it's easy to find.
export default function ExportMenu({
  projectId,
  labelled = false,
}: {
  projectId: string
  labelled?: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Export"
        aria-expanded={open}
        className={
          labelled
            ? 'flex items-center gap-1 rounded-lg border border-parchment px-4 py-2 text-sm font-medium text-ink-light hover:bg-parchment/50'
            : 'rounded-lg border border-parchment p-2 text-ink-muted hover:text-ink'
        }
      >
        <Download className="h-4 w-4" />
        {labelled && 'Export'}
      </button>
      {open && (
        <ul
          className={`absolute z-20 mt-1 w-60 rounded-lg border border-parchment bg-white py-1 text-xs shadow-lg ${
            labelled ? 'left-0' : 'right-0'
          }`}
        >
          {EXPORTS.map((e) => (
            <li key={e.query}>
              <a
                href={`/api/projects/${projectId}/export?${e.query}`}
                download
                onClick={() => setOpen(false)}
                className="block px-3 py-2 text-ink-light hover:bg-parchment/50 hover:text-ink"
              >
                {e.label}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
