'use client'

import { useState } from 'react'

type Props = {
  projectId: string
  initialEnabled: boolean
}

export default function ReviewToggle({ projectId, initialEnabled }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(next: boolean) {
    setEnabled(next)
    setPending(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewEnabled: next }),
      })
      if (!res.ok) throw new Error(String(res.status))
    } catch {
      setEnabled(!next)
      setError('Could not save. Please try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <label className="flex items-center gap-2 text-sm font-medium text-ink">
        <input
          type="checkbox"
          checked={enabled}
          disabled={pending}
          onChange={(e) => void save(e.target.checked)}
          className="h-4 w-4 accent-accent"
        />
        Review pass
      </label>
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}
