'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Loader2, Play } from 'lucide-react'
import { pollJob } from '@/lib/jobPoll'

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000)
  const mm = String(Math.floor(total / 60)).padStart(2, '0')
  const ss = String(total % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

export default function TranslateButton({
  projectId,
  chapterId,
}: {
  projectId: string
  chapterId: string
}) {
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [showSettingsLink, setShowSettingsLink] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!loading) return
    const start = Date.now()
    const t = setInterval(() => setElapsedMs(Date.now() - start), 500)
    return () => clearInterval(t)
  }, [loading])

  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  async function handleTranslate() {
    setLoading(true)
    setErrorMsg(null)
    setShowSettingsLink(false)
    setElapsedMs(0)

    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, chapterId }),
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        if (res.status === 402) {
          setErrorMsg(errBody.error || 'Free tier limit reached.')
          setShowSettingsLink(true)
        } else {
          setErrorMsg(errBody.error || 'Translation failed. Please try again.')
        }
        setLoading(false)
        return
      }
      const body = (await res.json()) as { id?: string }
      if (!body.id) {
        setErrorMsg('Translation failed. Please try again.')
        setLoading(false)
        return
      }

      const controller = new AbortController()
      abortRef.current = controller

      const final = await pollJob(body.id, { signal: controller.signal })
      if (final.status === 'SUCCEEDED') {
        window.location.reload()
        return
      }
      setErrorMsg('Translation failed. Please try again.')
      setLoading(false)
    } catch {
      setErrorMsg('Translation failed. Please try again.')
      setLoading(false)
    }
  }

  const label = loading ? `Translating… ${formatElapsed(elapsedMs)}` : 'Translate'

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleTranslate}
        disabled={loading}
        className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Play className="h-3.5 w-3.5" />
        )}
        {label}
      </button>
      {errorMsg && (
        <div role="alert" className="text-xs text-red-600">
          <p>{errorMsg}</p>
          {showSettingsLink && (
            <Link
              href="/dashboard/settings"
              className="mt-1 inline-block font-medium text-accent hover:underline"
            >
              Go to Settings to add your API key &rarr;
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
