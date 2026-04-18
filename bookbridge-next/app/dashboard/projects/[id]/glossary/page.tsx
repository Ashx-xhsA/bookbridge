import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import prisma from '@/lib/prisma'
import { ArrowLeft, Check, X } from 'lucide-react'

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
        </p>
      </div>

      {project.glossary.length === 0 ? (
        <p className="mt-8 text-center text-sm text-zinc-500">
          No glossary terms yet. Terms will be extracted during translation.
        </p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-3 text-left font-medium">English</th>
                <th className="px-4 py-3 text-left font-medium">
                  Translation
                </th>
                <th className="px-4 py-3 text-left font-medium">Category</th>
                <th className="px-4 py-3 text-center font-medium">Approved</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {project.glossary.map((term) => (
                <tr key={term.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900">
                  <td className="px-4 py-3 font-medium">{term.english}</td>
                  <td className="px-4 py-3">{term.translation || '—'}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs dark:bg-zinc-800">
                      {term.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {term.approved ? (
                      <Check className="mx-auto h-4 w-4 text-green-500" />
                    ) : (
                      <X className="mx-auto h-4 w-4 text-zinc-300" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
