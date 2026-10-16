// Source text lives in Segment rows (one per paragraph). Until Phase 2 moves
// translation to segment level, callers that need a chapter's full text select
// SEGMENT_SOURCES and join it with joinSegments.

export const SEGMENT_SOURCES = {
  select: { source: true },
  orderBy: { index: 'asc' },
} as const

export const PARAGRAPH_SEPARATOR = '\n\n'

export function joinSegments(segments: { source: string }[]): string {
  return segments.map((s) => s.source).join(PARAGRAPH_SEPARATOR)
}
