import { notFound } from 'next/navigation'
import Link from 'next/link'

type Chapter = {
  id: string
  number?: number
  chapterIndex?: number
  title?: string
  startPage?: number
  endPage?: number
}

type ReadProject = {
  title: string
  sourceLanguage?: string
  targetLanguage?: string
  status?: string
  chapters: Chapter[]
}

function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return ''
}

export default async function ReadTokenPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  const res = await fetch(`${getBaseUrl()}/api/read/${token}`, {
    cache: 'no-store',
  })

  if (res.status === 404) {
    notFound()
    return null
  }
  if (!res.ok) {
    // Generic message — never surface raw 4xx/5xx bodies to the public reader.
    throw new Error('Failed to load book')
  }

  const body = (await res.json()) as { data: ReadProject }
  const { title, sourceLanguage, targetLanguage, chapters } = body.data

  return (
    <div className="min-h-screen bg-cream">
      <header className="sticky top-0 z-10 border-b border-parchment bg-cream/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <Link
            href="/"
            className="flex items-center gap-2 font-serif text-sm font-bold text-ink"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white">
              B
            </span>
            BookBridge
          </Link>
          <Link
            href="/sign-up"
            className="rounded-lg bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent-hover"
          >
            Translate Your Book
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-12 text-center">
          <h1 className="font-serif text-4xl font-bold text-ink">{title}</h1>
          {sourceLanguage && targetLanguage && (
            <p className="mt-4 text-sm text-ink-muted">
              {sourceLanguage} → {targetLanguage} &middot; {chapters.length}{' '}
              chapters
            </p>
          )}
        </div>

        <section>
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-ink-muted">
            Contents
          </h2>
          <ul className="space-y-2">
            {chapters.map((ch, i) => {
              const n = ch.number ?? ch.chapterIndex ?? i + 1
              const label =
                ch.title && ch.title.trim()
                  ? `Chapter ${n}: ${ch.title}`
                  : `Chapter ${n}`
              return (
                <li
                  key={ch.id}
                  className="rounded-lg border border-parchment bg-paper/50 p-4"
                >
                  <Link
                    href={`/read/${token}/chapters/${ch.id}`}
                    className="font-serif text-lg text-ink hover:text-accent"
                  >
                    {label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      </div>
    </div>
  )
}
