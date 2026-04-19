'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Loader2 } from 'lucide-react'

type Phase = 'idle' | 'confirming' | 'deleting'

export default function DeleteProjectButton({ projectId }: { projectId: string }) {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function handleConfirm() {
    setPhase('deleting')
    setErrorMsg(null)
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' })
      if (!res.ok) {
        let message = 'Failed to delete project. Please try again.'
        try {
          const body = (await res.json()) as { error?: string }
          if (body?.error) message = body.error
        } catch {
          // non-JSON response — keep generic message
        }
        setErrorMsg(message)
        setPhase('confirming')
        return
      }
      router.push('/dashboard')
    } catch {
      setErrorMsg('Network error. Please try again.')
      setPhase('confirming')
    }
  }

  if (phase === 'idle') {
    return (
      <button
        onClick={() => setPhase('confirming')}
        className="flex items-center gap-1 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
      >
        <Trash2 className="h-4 w-4" />
        Delete
      </button>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <button
          onClick={() => {
            setPhase('idle')
            setErrorMsg(null)
          }}
          disabled={phase === 'deleting'}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Cancel
        </button>
        <button
          onClick={handleConfirm}
          disabled={phase === 'deleting'}
          className="flex items-center gap-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {phase === 'deleting' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
          Confirm delete
        </button>
      </div>
      {errorMsg && (
        <p role="alert" className="text-xs text-red-600">
          {errorMsg}
        </p>
      )}
    </div>
  )
}
