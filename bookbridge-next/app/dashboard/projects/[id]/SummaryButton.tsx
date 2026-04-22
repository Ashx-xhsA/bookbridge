'use client'

import { useState } from 'react'
import { Loader2, Sparkles, Eye } from 'lucide-react'

export default function SummaryButton({
  projectId,
  chapterId,
  hasSummary,
  onSummaryGenerated,
}: {
  projectId: string
  chapterId: string
  hasSummary: boolean
  onSummaryGenerated: (summary: string) => void
}) {
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function handleGenerate() {
    setLoading(true)
    setErrorMsg(null)

    try {
      const res = await fetch(`/api/projects/${projectId}/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapterId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErrorMsg(data?.error ?? 'Failed to generate summary.')
        setLoading(false)
        return
      }
      if (data.results && data.results.length > 0) {
        onSummaryGenerated(data.results[0].summary)
      } else {
        setErrorMsg('Failed to generate summary.')
      }
    } catch {
      setErrorMsg('Failed to generate summary.')
    } finally {
      setLoading(false)
    }
  }

  function handleView() {
    // Scroll to summary section or just a no-op since it's already rendered below
    const el = document.getElementById('chapter-summary-section')
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' })
    }
  }

  if (hasSummary) {
    return (
      <button
        onClick={handleView}
        className="flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/5 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/10"
        title="View Summary"
      >
        <Eye className="h-3.5 w-3.5" />
        View Summary
      </button>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleGenerate}
        disabled={loading}
        className="flex items-center gap-1.5 rounded-lg border border-accent/30 bg-white px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/5 disabled:opacity-50"
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Sparkles className="h-3.5 w-3.5" />
        )}
        {loading ? 'Generating...' : 'Generate Summary'}
      </button>
      {errorMsg && <span className="text-[10px] text-red-500">{errorMsg}</span>}
    </div>
  )
}
