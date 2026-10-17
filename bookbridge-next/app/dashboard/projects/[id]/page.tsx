import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import prisma from '@/lib/prisma'
import { CHAPTER_PROGRESS, isChapterDone } from '@/lib/segments'
import { BookOpen, ArrowLeft, Sparkles } from 'lucide-react'
import DeleteProjectButton from './DeleteProjectButton'
import PublishToggle from './PublishToggle'
import ChapterExplorer from './ChapterExplorer'
import BibleNudge from './BibleNudge'

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  // Outline only: chapter titles plus a cheap progress probe. Paragraph text
  // is loaded per chapter by ChapterExplorer when a chapter is selected.
  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      sourceLang: true,
      targetLang: true,
      ownerId: true,
      isPublic: true,
      publicToken: true,
      chapters: {
        orderBy: { number: 'asc' },
        select: { id: true, number: true, title: true, summary: true, ...CHAPTER_PROGRESS },
      },
      jobs: { select: { id: true, chapterId: true, status: true } },
      _count: { select: { glossary: true } },
      bible: { select: { status: true, scanStatus: true } },
    },
  })

  if (!project) notFound()
  if (project.ownerId !== userId) notFound()

  const [unreviewed, flaggedGroups] = await Promise.all([
    prisma.glossaryTerm.count({ where: { projectId: id, approved: false, userEdited: false } }),
    prisma.segment.groupBy({
      by: ['chapterId'],
      where: { status: 'flagged', chapter: { projectId: id } },
      _count: { _all: true },
    }),
  ])
  const flaggedByChapter = new Map(flaggedGroups.map((g) => [g.chapterId, g._count._all]))

  const translatedCount = project.chapters.filter(isChapterDone).length
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
            href={`/dashboard/projects/${id}/bible`}
            className="rounded-lg border border-parchment px-4 py-2 text-sm font-medium text-ink-light hover:bg-parchment/50"
          >
            <Sparkles className="mr-1 inline h-4 w-4" />
            Book bible
          </Link>
          <Link
            href={`/dashboard/projects/${id}/glossary`}
            className="relative rounded-lg border border-parchment px-4 py-2 text-sm font-medium text-ink-light hover:bg-parchment/50"
          >
            <BookOpen className="mr-1 inline h-4 w-4" />
            Glossary ({project._count.glossary})
            {unreviewed > 0 && (
              <span
                aria-label={`${unreviewed} unreviewed terms`}
                className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-xs font-semibold text-white"
              >
                {unreviewed}
              </span>
            )}
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

      {totalChapters > 0 && (
        <BibleNudge
          projectId={project.id}
          status={project.bible?.status ?? null}
          scanStatus={project.bible?.scanStatus ?? null}
        />
      )}

      <div className="mt-8">
        <ChapterExplorer
          chapters={project.chapters.map((c) => ({
            id: c.id,
            number: c.number,
            title: c.title,
            paragraphCount: c._count.segments,
            translated: isChapterDone(c),
            flaggedCount: flaggedByChapter.get(c.id) ?? 0,
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
