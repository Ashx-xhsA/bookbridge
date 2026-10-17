import { z } from 'zod'
import prisma from '@/lib/prisma'
import { publicRows, type PublicRow } from '@/lib/reader'
import { READER_OUTLINE, loadFirstChapterRows, toReaderChapters } from '@/lib/reader-data'

// publicToken is minted via crypto.randomUUID() in the project publish flow, so
// the format is strict — reject anything non-UUID at the edge to shrink the
// attack surface before the DB is touched.
export const tokenSchema = z.string().uuid()

// Filters on isPublic=true so unknown tokens and unpublished projects both
// resolve to null. Callers must return 404 (never 403) on null — a 403 would
// confirm the project exists and enable enumeration (OWASP A01).

export async function getPublishedProjectId(
  token: string,
): Promise<string | null> {
  const project = await prisma.project.findFirst({
    where: { publicToken: token, isPublic: true },
    select: { id: true },
  })
  return project?.id ?? null
}

export async function getPublishedProjectWithChapters(token: string) {
  return prisma.project.findFirst({
    where: { publicToken: token, isPublic: true },
    include: {
      chapters: {
        orderBy: { number: 'asc' },
        select: { id: true, number: true, title: true },
      },
    },
  })
}

// Reader-page variant: the chapter outline plus the first chapter's
// paragraphs, without review status or issues. Later chapters come from the
// per-chunk endpoint as the reader scrolls.
export async function getPublishedProjectForReader(token: string) {
  const project = await prisma.project.findFirst({
    where: { publicToken: token, isPublic: true },
    select: { title: true, sourceLang: true, targetLang: true, chapters: READER_OUTLINE },
  })
  if (!project) return null

  const firstRows = await loadFirstChapterRows(project.chapters)
  const initialRows: Record<string, PublicRow[]> = {}
  for (const [key, rows] of Object.entries(firstRows)) initialRows[key] = publicRows(rows)

  return {
    title: project.title,
    sourceLang: project.sourceLang,
    targetLang: project.targetLang,
    chapters: toReaderChapters(project.chapters),
    initialRows,
  }
}
