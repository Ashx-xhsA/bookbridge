import { z } from 'zod'
import prisma from '@/lib/prisma'
import { SEARCH_QUERY_MAX, SEARCH_QUERY_MIN, makeSnippet, type SearchHit } from '@/lib/reader'

// Full-book search for the reader, run in the database so the browser never
// needs the whole book. Callers check access to projectId first.

export const searchQuerySchema = z.string().trim().min(SEARCH_QUERY_MIN).max(SEARCH_QUERY_MAX)

const MAX_HITS = 50

export async function searchSegments(projectId: string, query: string): Promise<SearchHit[]> {
  const segments = await prisma.segment.findMany({
    where: {
      chapter: { projectId },
      OR: [
        { source: { contains: query, mode: 'insensitive' } },
        { translation: { contains: query, mode: 'insensitive' } },
      ],
    },
    select: {
      index: true,
      source: true,
      translation: true,
      chapter: { select: { id: true, number: true, title: true } },
    },
    orderBy: [{ chapter: { number: 'asc' } }, { index: 'asc' }],
    take: MAX_HITS,
  })

  const q = query.toLowerCase()
  return segments.map((s) => {
    const inSource = s.source.toLowerCase().includes(q)
    const text = inSource || !s.translation ? s.source : s.translation
    return {
      chapterId: s.chapter.id,
      chapterNumber: s.chapter.number,
      chapterTitle: s.chapter.title,
      index: s.index,
      snippet: makeSnippet(text, query),
    }
  })
}
