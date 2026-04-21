'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Sparkles, Loader2, AlertTriangle } from 'lucide-react'

export default function GlossaryActions({
  projectId,
  hasApiKey,
  estimatedTokens,
}: {
  projectId: string
  hasApiKey: boolean
  estimatedTokens: number
}) {
  const [extracting, setExtracting] = useState(false)
  const [result, setResult] = useState<{ extracted: number; skipped: number } | null>(null)
  const [error, setError] = useState('')

  async function handleExtract() {
    setExtracting(true)
    setError('')
    setResult(null)

    try {
      const res = await fetch(`/api/projects/${projectId}/glossary/extract`, {
        method: 'POST',
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Extraction failed')
        return
      }

      setResult({ extracted: data.extracted, skipped: data.skipped })
      if (data.extracted > 0) {
        setTimeout(() => window.location.reload(), 1500)
      }
    } catch {
      setError('Failed to extract glossary terms')
    } finally {
      setExtracting(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {hasApiKey ? (
        <>
          <button
            onClick={handleExtract}
            disabled={extracting}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {extracting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {extracting ? 'Extracting...' : 'Auto-extract Glossary'}
          </button>
          <p className="text-xs text-ink-muted">
            ~{estimatedTokens.toLocaleString()} tokens estimated
          </p>
        </>
      ) : (
        <div className="flex items-center gap-2 rounded-lg bg-highlight/50 px-3 py-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-ink-muted" />
          <p className="text-xs text-ink-muted">
            <Link href="/dashboard/settings" className="font-medium text-accent hover:underline">
              Add your API key
            </Link>{' '}
            to enable auto-extraction.
          </p>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}

      {result && (
        <p className="text-xs text-green-700">
          Extracted {result.extracted} new terms
          {result.skipped > 0 && ` (${result.skipped} duplicates skipped)`}
        </p>
      )}
    </div>
  )
}
