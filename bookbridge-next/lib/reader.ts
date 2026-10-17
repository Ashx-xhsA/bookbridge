import { z } from 'zod'

// One row per source paragraph for the aligned (bilingual) reader and export.
// Unlike joinTranslations, untranslated paragraphs keep their place with
// translation: null, so source and translation never drift apart.

export const SEGMENT_ROW = {
  select: { index: true, source: true, translation: true, status: true, reviewIssues: true },
  orderBy: { index: 'asc' },
} as const

const SEGMENT_STATUSES = ['pending', 'translated', 'reviewed', 'flagged', 'failed'] as const
export type SegmentStatus = (typeof SEGMENT_STATUSES)[number]

// Same shape the worker callback stores in Segment.reviewIssues.
const reviewIssueSchema = z.object({
  category: z.string(),
  severity: z.enum(['error', 'warning']),
  message: z.string(),
})
export type ReviewIssue = z.infer<typeof reviewIssueSchema>

export interface AlignedRow {
  index: number
  source: string
  translation: string | null
  status: SegmentStatus
  issues: ReviewIssue[]
}

// What a public (shared-link) reader sees: no status, no review issues.
export type PublicRow = Pick<AlignedRow, 'index' | 'source' | 'translation'>

interface SegmentRecord {
  index: number
  source: string
  translation: string | null
  status: string
  reviewIssues: unknown
}

function parseIssues(value: unknown): ReviewIssue[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const parsed = reviewIssueSchema.safeParse(item)
    return parsed.success ? [parsed.data] : []
  })
}

function parseStatus(value: string): SegmentStatus {
  return (SEGMENT_STATUSES as readonly string[]).includes(value)
    ? (value as SegmentStatus)
    : 'pending'
}

export function toAlignedRows(segments: SegmentRecord[]): AlignedRow[] {
  return segments.map((s) => ({
    index: s.index,
    source: s.source,
    translation: s.translation,
    status: parseStatus(s.status),
    issues: parseIssues(s.reviewIssues),
  }))
}

export function publicRows(rows: AlignedRow[]): PublicRow[] {
  return rows.map(({ index, source, translation }) => ({ index, source, translation }))
}
