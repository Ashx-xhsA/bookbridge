'use client'

import { useState } from 'react'
import { Loader2, Link2, Copy, RotateCw, EyeOff } from 'lucide-react'

type Props = {
  projectId: string
  initialIsPublic: boolean
  initialPublicToken: string | null
}

type PatchResponse = {
  data?: { isPublic: boolean; publicToken: string | null }
}

export default function PublishToggle({
  projectId,
  initialIsPublic,
  initialPublicToken,
}: Props) {
  const [isPublic, setIsPublic] = useState(initialIsPublic)
  const [token, setToken] = useState<string | null>(initialPublicToken)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function patchPublish(nextIsPublic: boolean) {
    setPending(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublic: nextIsPublic }),
      })
      if (!res.ok) {
        setError(
          res.status === 403
            ? 'You are not allowed to publish this project.'
            : res.status === 404
              ? 'Project not found.'
              : 'Failed to update publish status. Please try again.',
        )
        return
      }
      const body = (await res.json()) as PatchResponse
      setIsPublic(!!body.data?.isPublic)
      setToken(body.data?.publicToken ?? null)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setPending(false)
    }
  }

  async function handleCopy() {
    if (!token) return
    const url = `${window.location.origin}/read/${token}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Could not copy to clipboard.')
    }
  }

  function handleRepublish() {
    const ok = window.confirm(
      'Republishing will rotate the public link. The old link will stop working for anyone who has it. Continue?',
    )
    if (!ok) return
    void patchPublish(true)
  }

  if (!isPublic || !token) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={() => void patchPublish(true)}
          disabled={pending}
          className="flex items-center gap-1 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Link2 className="h-4 w-4" />
          )}
          Publish
        </button>
        {error && (
          <p role="alert" className="text-xs text-red-600">
            {error}
          </p>
        )}
      </div>
    )
  }

  const publicUrl = `/read/${token}`

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <code className="rounded-md border border-parchment bg-paper px-2 py-1 text-xs">
          {publicUrl}
        </code>
        <button
          type="button"
          onClick={handleCopy}
          disabled={pending}
          className="flex items-center gap-1 rounded-lg border border-parchment px-3 py-2 text-sm font-medium text-ink-light hover:bg-parchment/30 disabled:opacity-50"
        >
          <Copy className="h-4 w-4" />
          Copy
        </button>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleRepublish}
          disabled={pending}
          className="flex items-center gap-1 rounded-lg border border-highlight px-3 py-2 text-sm font-medium text-spine hover:bg-highlight/30 disabled:opacity-50"
        >
          <RotateCw className="h-4 w-4" />
          Republish
        </button>
        <button
          type="button"
          onClick={() => void patchPublish(false)}
          disabled={pending}
          className="flex items-center gap-1 rounded-lg border border-parchment px-3 py-2 text-sm font-medium text-ink-light hover:bg-parchment/30 disabled:opacity-50"
        >
          <EyeOff className="h-4 w-4" />
          Unpublish
        </button>
      </div>
      {copied && (
        <p role="status" className="text-xs text-green-700">
          Copied!
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}
