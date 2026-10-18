import { notFound, redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { READER_OUTLINE, loadFirstChapterRows, toReaderChapters } from '@/lib/reader-data'
import {
  getPublishedProjectForReader,
  tokenSchema,
} from '@/lib/public-project'
import ReaderView from './ReaderView'

export default async function ReaderPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // Public-token branch: the token IS the authorization (OWASP A01 per #32).
  // Dispatch on `tokenSchema` (the same z.string().uuid() used elsewhere for
  // public tokens) rather than a hand-rolled regex so validation stays in one
  // place. Unknown or unpublished tokens return the same notFound() response
  // so an attacker cannot differentiate "doesn't exist" from "exists but
  // private". Next 16 forbids sibling [id]/[token] slugs, so owner cuids and
  // public uuids must share this one segment.
  if (tokenSchema.safeParse(id).success) {
    const reader = await getPublishedProjectForReader(id)
    if (!reader) return notFound()

    return (
      <ReaderView
        title={reader.title}
        sourceLang={reader.sourceLang}
        targetLang={reader.targetLang}
        chapters={reader.chapters}
        initialRows={reader.initialRows}
        source={{ kind: 'public', token: id }}
      />
    )
  }

  const { userId } = await auth()
  if (!userId) return redirect('/sign-in')

  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      title: true,
      sourceLang: true,
      targetLang: true,
      ownerId: true,
      isPublic: true,
      publicToken: true,
      chapters: READER_OUTLINE,
    },
  })

  if (!project) return notFound()
  if (project.ownerId !== userId) {
    // Other signed-in users read a published book through its shared link,
    // which never carries review details.
    if (project.isPublic && project.publicToken) return redirect(`/read/${project.publicToken}`)
    return notFound()
  }

  return (
    <ReaderView
      title={project.title}
      sourceLang={project.sourceLang}
      targetLang={project.targetLang}
      chapters={toReaderChapters(project.chapters)}
      initialRows={await loadFirstChapterRows(project.chapters)}
      source={{ kind: 'owner', projectId: id }}
    />
  )
}
