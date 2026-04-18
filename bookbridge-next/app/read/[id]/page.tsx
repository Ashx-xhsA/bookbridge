import { notFound } from 'next/navigation'
import Link from 'next/link'
import prisma from '@/lib/prisma'
import { BookOpen, ArrowLeft } from 'lucide-react'

export default async function ReaderPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  if (id === 'demo') {
    return (
      <div className="min-h-screen bg-white dark:bg-zinc-950">
        <header className="border-b border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-6">
            <BookOpen className="h-5 w-5 text-blue-600" />
            <span className="font-semibold">BookBridge Reader</span>
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-6 py-12">
          <h1 className="text-3xl font-bold">Demo: Bilingual Reader</h1>
          <p className="mt-4 text-zinc-600 dark:text-zinc-400">
            This is a demo of the bilingual reading view. When a project is
            published, readers can view the original and translated text
            side by side.
          </p>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <div className="rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
              <h3 className="mb-3 text-sm font-semibold uppercase text-zinc-400">
                Original (English)
              </h3>
              <p className="leading-relaxed">
                The city had been called Embassytown for as long as anyone
                could remember, though it was not technically a town but a
                district of the larger settlement, and the embassy it was
                named for had not been active in decades.
              </p>
            </div>
            <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-6 dark:border-blue-900 dark:bg-blue-950/30">
              <h3 className="mb-3 text-sm font-semibold uppercase text-blue-500">
                Translation
              </h3>
              <p className="leading-relaxed">
                Sample translated text would appear here. Each chapter can be
                translated independently, maintaining glossary consistency
                across the entire book.
              </p>
            </div>
          </div>
        </main>
      </div>
    )
  }

  const project = await prisma.project.findUnique({
    where: { id, isPublic: true },
    include: { chapters: { orderBy: { number: 'asc' } } },
  })

  if (!project) notFound()

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-6">
          <Link href="/" className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-blue-600" />
            <span className="font-semibold">BookBridge Reader</span>
          </Link>
          <span className="text-zinc-300 dark:text-zinc-700">/</span>
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            {project.title}
          </span>
        </div>
      </header>

      <div className="flex">
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-64 overflow-y-auto border-r border-zinc-200 p-4 lg:block dark:border-zinc-800">
          <h3 className="mb-3 text-xs font-semibold uppercase text-zinc-400">
            Chapters
          </h3>
          <nav className="space-y-1">
            {project.chapters.map((ch) => (
              <a
                key={ch.id}
                href={`#ch-${ch.number}`}
                className="block rounded-md px-3 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900"
              >
                {ch.number}. {ch.title}
              </a>
            ))}
          </nav>
        </aside>

        <main className="flex-1 px-6 py-8">
          <div className="mx-auto max-w-4xl">
            <h1 className="text-3xl font-bold">{project.title}</h1>
            <p className="mt-2 text-sm text-zinc-500">
              {project.sourceLang} &rarr; {project.targetLang}
            </p>

            <div className="mt-10 space-y-12">
              {project.chapters.map((ch) => (
                <section key={ch.id} id={`ch-${ch.number}`}>
                  <h2 className="text-xl font-bold">
                    Chapter {ch.number}: {ch.title}
                  </h2>
                  <div className="mt-4 grid gap-6 md:grid-cols-2">
                    <div className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
                      <h3 className="mb-2 text-xs font-semibold uppercase text-zinc-400">
                        Original
                      </h3>
                      <div className="whitespace-pre-wrap text-sm leading-relaxed">
                        {ch.sourceContent || 'Content not available'}
                      </div>
                    </div>
                    <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-5 dark:border-blue-900 dark:bg-blue-950/30">
                      <h3 className="mb-2 text-xs font-semibold uppercase text-blue-500">
                        Translation
                      </h3>
                      <div className="whitespace-pre-wrap text-sm leading-relaxed">
                        {ch.translation || 'Not yet translated'}
                      </div>
                    </div>
                  </div>
                </section>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
