import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import prisma from '@/lib/prisma'
import GlossaryTable from '@/app/components/glossary/GlossaryTable'

export default async function GlossaryPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const project = await prisma.project.findUnique({
    where: { id },
    include: { glossary: { orderBy: { english: 'asc' } } },
  })

  if (!project) notFound()
  if (project.ownerId !== userId) notFound()

  const unreviewedCount = project.glossary.filter(
    (t) => !t.approved && !t.userEdited
  ).length

  return (
    <div>
      <Link
        href={`/dashboard/projects/${id}`}
        className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Project
      </Link>

      <div className="mt-4">
        <h1 className="text-2xl font-bold">Glossary</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {project.title} &mdash; {project.glossary.length} terms
          {unreviewedCount > 0 && (
            <>
              {' · '}
              <span className="font-medium text-amber-700 dark:text-amber-400">
                {unreviewedCount} unreviewed
              </span>
            </>
          )}
        </p>
      </div>

      <div className="mt-6">
        <GlossaryTable
          projectId={id}
          initialTerms={project.glossary.map((t) => ({
            id: t.id,
            english: t.english,
            translation: t.translation,
            category: t.category,
            approved: t.approved,
            userEdited: t.userEdited,
            notes: t.notes ?? undefined,
          }))}
        />
      </div>
    </div>
  )
}
