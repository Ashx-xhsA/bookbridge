'use client'

import { useState } from 'react'
import { Loader2, Play } from 'lucide-react'

export default function TranslateButton({
  projectId,
  chapterId,
}: {
  projectId: string
  chapterId: string
}) {
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function handleTranslate() {
    setLoading(true)
    setErrorMsg(null)
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, chapterId }),
      })
      if (!res.ok) {
        let message = 'Translation failed. Please try again.'
        try {
          const body = (await res.json()) as { error?: string }
          if (body?.error) message = body.error
        } catch {
          // non-JSON response — keep generic message
        }
        setErrorMsg(message)
        setLoading(false)
        return
      }
      window.location.reload()
    } catch {
      setErrorMsg('Network error. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleTranslate}
        disabled={loading}
        className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Play className="h-3.5 w-3.5" />
        )}
        Translate
      </button>
      {errorMsg && (
        <p role="alert" className="text-xs text-red-600">
          {errorMsg}
        </p>
      )}
    </div>
  )
}
