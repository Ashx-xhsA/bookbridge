import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import prisma from '@/lib/prisma'
import { BookOpen, ArrowLeft } from 'lucide-react'
import DeleteProjectButton from './DeleteProjectButton'
import PublishToggle from './PublishToggle'
import ChapterExplorer from './ChapterExplorer'

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      chapters: { orderBy: { number: 'asc' } },
      jobs: true,
      glossary: { orderBy: { english: 'asc' } },
    },
  })

  if (!project) notFound()
  if (project.ownerId !== userId) notFound()

  const translatedCount = project.chapters.filter((c) => c.translation).length
  const totalChapters = project.chapters.length
  const progress = totalChapters > 0 ? Math.round((translatedCount / totalChapters) * 100) : 0

  return (
    <div>
      <Link
        href="/dashboard"
        className="flex items-center gap-1 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Dashboard
      </Link>

      <div className="mt-4 flex items-start justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold text-ink">{project.title}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {project.sourceLang} &rarr; {project.targetLang} &middot;{' '}
            {totalChapters} chapters
          </p>
          {totalChapters > 0 && (
            <div className="mt-3 flex items-center gap-3">
              <Link
                href={`/read/${id}`}
                className="inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
              >
                Start Reading
              </Link>
              <div className="flex items-center gap-2">
                <div className="h-2 w-24 overflow-hidden rounded-full bg-parchment">
                  <div
                    className="h-full rounded-full bg-accent transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="text-xs text-ink-muted">{progress}%</span>
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Link
            href={`/dashboard/projects/${id}/glossary`}
            className="relative rounded-lg border border-parchment px-4 py-2 text-sm font-medium text-ink-light hover:bg-parchment/50"
          >
            <BookOpen className="mr-1 inline h-4 w-4" />
            Glossary ({project.glossary.length})
            {(() => {
              const unreviewed = project.glossary.filter(
                (t) => !t.approved && !t.userEdited
              ).length
              return unreviewed > 0 ? (
                <span
                  aria-label={`${unreviewed} unreviewed terms`}
                  className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-xs font-semibold text-white"
                >
                  {unreviewed}
                </span>
              ) : null
            })()}
          </Link>
          <DeleteProjectButton projectId={project.id} />
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-parchment bg-white p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-ink">Public link</h2>
            <p className="mt-1 text-xs text-ink-muted">
              Publish this book to share a read-only link with anyone.
            </p>
          </div>
          <PublishToggle
            projectId={project.id}
            initialIsPublic={project.isPublic}
            initialPublicToken={project.publicToken}
          />
        </div>
      </div>

      <div className="mt-8">
        <ChapterExplorer
          chapters={project.chapters.map((c) => ({
            id: c.id,
            number: c.number,
            title: c.title,
            startPage: c.startPage,
            endPage: c.endPage,
            sourceContent: c.sourceContent,
            translation: c.translation,
            summary: c.summary,
          }))}
          jobs={project.jobs.map((j) => ({
            id: j.id,
            chapterId: j.chapterId,
            status: j.status,
          }))}
          projectId={project.id}
        />
      </div>
    </div>
  )
}
