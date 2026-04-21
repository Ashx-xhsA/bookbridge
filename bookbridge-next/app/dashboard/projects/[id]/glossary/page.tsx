import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import prisma from '@/lib/prisma'
import { ArrowLeft, Check, X } from 'lucide-react'
import GlossaryActions from './GlossaryActions'

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
    include: {
      glossary: { orderBy: { english: 'asc' } },
      chapters: { select: { sourceContent: true } },
    },
  })

  if (!project) notFound()
  if (project.ownerId !== userId) notFound()

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { apiKey: true },
  })

  const hasLLMAccess = !!user?.apiKey || !!process.env.BUILTIN_LLM_API_KEY

  const totalChars = project.chapters.reduce(
    (sum, c) => sum + (c.sourceContent?.length || 0),
    0
  )
  const estimatedTokens = Math.round(totalChars / 4)

  return (
    <div>
      <Link
        href={`/dashboard/projects/${id}`}
        className="flex items-center gap-1 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Project
      </Link>

      <div className="mt-4 flex items-start justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold text-ink">Glossary</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {project.title} &mdash; {project.glossary.length} terms
          </p>
        </div>
        <GlossaryActions
          projectId={id}
          hasApiKey={hasLLMAccess}
          estimatedTokens={estimatedTokens}
        />
      </div>

      {project.glossary.length === 0 ? (
        <div className="mt-12 text-center">
          <p className="text-sm text-ink-muted">
            No glossary terms yet.
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            {hasLLMAccess
              ? 'Click "Auto-extract" to identify key terms from your book.'
              : 'Add your API key in Settings to enable automatic glossary extraction.'}
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-parchment">
          <table className="w-full text-sm">
            <thead className="bg-paper/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-ink">English</th>
                <th className="px-4 py-3 text-left font-medium text-ink">Translation</th>
                <th className="px-4 py-3 text-left font-medium text-ink">Category</th>
                <th className="px-4 py-3 text-center font-medium text-ink">Approved</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-parchment">
              {project.glossary.map((term) => (
                <tr key={term.id} className="hover:bg-paper/30">
                  <td className="px-4 py-3 font-medium text-ink">{term.english}</td>
                  <td className="px-4 py-3 text-ink-light">{term.translation || '—'}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-parchment px-2 py-0.5 text-xs text-ink-muted">
                      {term.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {term.approved ? (
                      <Check className="mx-auto h-4 w-4 text-green-500" />
                    ) : (
                      <X className="mx-auto h-4 w-4 text-ink-muted/30" />
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
