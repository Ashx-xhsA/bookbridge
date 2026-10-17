import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import prisma from '@/lib/prisma'
import { loadBibleEntries } from '@/lib/bible-entries'
import { BIBLE_STATE, toBibleState } from '@/lib/bible-state'
import { ensureSourceChars } from '@/lib/book-size'
import BibleReview from './BibleReview'

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
      sourceChars: true,
      bible: { select: BIBLE_STATE },
    },
  })
  if (!project || project.ownerId !== userId) notFound()

  // First page of each group; the rest loads from the entries API.
  const [people, others, sourceChars] = await Promise.all([
    loadBibleEntries(id, { group: 'person' }),
    loadBibleEntries(id, { group: 'other' }),
    ensureSourceChars(id, project.sourceChars),
  ])
  const bible = project.bible && toBibleState(project.bible)
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
          key={`${bible?.status}-${bible?.scanStatus}-${bible?.updatedAt.getTime()}`}
          projectId={id}
          bible={bible}
          sourceChars={sourceChars}
          people={people}
          others={others}
        />
      </div>
    </div>
  )
}
