import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import prisma from '@/lib/prisma'
import BibleReview, { type BibleEntry } from './BibleReview'

export default async function BiblePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      ownerId: true,
      bible: { select: { status: true, styleGuide: true, jobId: true, updatedAt: true } },
      glossary: {
        where: { aliasOfId: null },
        orderBy: [{ mentions: 'desc' }, { english: 'asc' }],
        select: {
          id: true,
          english: true,
          translation: true,
          category: true,
          gender: true,
          voice: true,
          mentions: true,
          approved: true,
          userEdited: true,
          aliases: {
            orderBy: { english: 'asc' },
            select: { id: true, english: true, translation: true },
          },
        },
      },
    },
  })
  if (!project || project.ownerId !== userId) notFound()

  const entries: BibleEntry[] = project.glossary
  return (
    <div>
      <Link
        href={`/dashboard/projects/${id}`}
        className="flex items-center gap-1 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Project
      </Link>
      <div className="mt-4">
        <h1 className="font-serif text-2xl font-bold text-ink">Book bible</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {project.title} &mdash; names, aliases, voices and style used for every chapter.
        </p>
      </div>
      <div className="mt-6">
        {/* Remount after a scan finishes so client state starts from fresh data. */}
        <BibleReview
          key={`${project.bible?.status}-${project.bible?.updatedAt.getTime()}`}
          projectId={id}
          bible={project.bible}
          entries={entries}
        />
      </div>
    </div>
  )
}
