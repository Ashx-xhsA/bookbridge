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

  async function handleTranslate() {
    setLoading(true)
    try {
      await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, chapterId }),
      })
      window.location.reload()
    } catch {
      setLoading(false)
    }
  }

  return (
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
  )
}
