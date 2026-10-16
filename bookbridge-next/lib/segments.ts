import type { Prisma } from '@/app/generated/prisma/client'

// Source and translation text live in Segment rows (one per paragraph).
// Chapter-level views select SEGMENT_SOURCES / SEGMENT_TEXT and join here.

export const SEGMENT_SOURCES = {
  select: { source: true },
  orderBy: { index: 'asc' },
} as const

export const SEGMENT_TEXT = {
  select: { source: true, translation: true, status: true },
  orderBy: { index: 'asc' },
} as const

export const PARAGRAPH_SEPARATOR = '\n\n'

export function joinSegments(segments: { source: string }[]): string {
  return segments.map((s) => s.source).join(PARAGRAPH_SEPARATOR)
}

// Joined translation of the segments done so far; null when none are.
export function joinTranslations(segments: { translation: string | null }[]): string | null {
  const done = segments.flatMap((s) => (s.translation ? [s.translation] : []))
  return done.length > 0 ? done.join(PARAGRAPH_SEPARATOR) : null
}

// A segment whose retranslation failed keeps its old text (still shown) but
// is not done: the chapter counts as untranslated until it is redone.
export function isFullyTranslated(
  segments: { translation: string | null; status?: string }[]
): boolean {
  return segments.length > 0 && segments.every((s) => !!s.translation && s.status !== 'failed')
}

// Cheap "is this chapter done?" probe for list views: the segment count plus
// at most one segment still to do (untranslated or failed), instead of
// loading every translation.
export const CHAPTER_PROGRESS = {
  _count: { select: { segments: true } },
  segments: {
    where: { OR: [{ translation: null }, { status: 'failed' }] as Prisma.SegmentWhereInput[] },
    select: { id: true },
    take: 1,
  },
} as const

export function isChapterDone(c: { _count: { segments: number }; segments: unknown[] }): boolean {
  return c._count.segments > 0 && c.segments.length === 0
}
