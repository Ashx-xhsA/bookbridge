import prisma from '@/lib/prisma'
import { CHAPTER_PROGRESS, isChapterDone } from '@/lib/segments'
import { SEGMENT_ROW, toAlignedRows, type AlignedRow, type ReaderChapter } from '@/lib/reader'

// Server-side loading for the reader: the chapter outline (no paragraph
// text) plus the paragraphs of the first chapter only. Later chapters are
// fetched by the browser one at a time.

export const READER_OUTLINE = {
  orderBy: { number: 'asc' },
  select: { id: true, number: true, title: true, ...CHAPTER_PROGRESS },
} as const

type OutlineChapter = {
  id: string
  number: number
  title: string
  _count: { segments: number }
  segments: unknown[]
}

export function toReaderChapters(chapters: OutlineChapter[]): ReaderChapter[] {
  return chapters.map((c) => ({
    key: c.id,
    id: c.id,
    number: c.number,
    title: c.title,
    done: isChapterDone(c),
  }))
}

export async function loadFirstChapterRows(
  chapters: { id: string }[]
): Promise<Record<string, AlignedRow[]>> {
  const first = chapters[0]
  if (!first) return {}
  const segments = await prisma.segment.findMany({ where: { chapterId: first.id }, ...SEGMENT_ROW })
  return { [first.id]: toAlignedRows(segments) }
}
