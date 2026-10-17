import Link from 'next/link'
import { Sparkles } from 'lucide-react'

const MESSAGES = {
  scan: 'Scan the book first to build a book bible — an overview of the story, characters and tone, and consistent names across chapters.',
  scanning: 'The book is being scanned. The bible will be ready for review in a few minutes.',
  failed: 'The last book scan failed. Scan again to build the book bible.',
  draft: 'Your book bible is a draft. Review the overview before translating.',
}

function messageFor(status: string | null, scanStatus: string | null): string | null {
  if (status === 'CONFIRMED') return null
  if (status === 'DRAFT') return MESSAGES.draft
  if (scanStatus === 'SCANNING') return MESSAGES.scanning
  if (scanStatus === 'FAILED') return MESSAGES.failed
  return MESSAGES.scan
}

export default function BibleNudge({
  projectId,
  status,
  scanStatus,
}: {
  projectId: string
  status: string | null
  scanStatus: string | null
}) {
  const message = messageFor(status, scanStatus)
  if (!message) return null
  return (
    <div
      role="note"
      className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
    >
      <p className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 shrink-0" />
        {message}
      </p>
      <Link
        href={`/dashboard/projects/${projectId}/bible`}
        className="rounded-lg bg-amber-600 px-3 py-1.5 font-medium text-white hover:bg-amber-700"
      >
        {status === 'DRAFT' ? 'Review bible' : 'Open book bible'}
      </Link>
    </div>
  )
}
