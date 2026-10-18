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

// A row as the reader renders it: owner rows carry status and issues,
// shared-link and demo rows do not.
export type ReaderRow = PublicRow & Partial<Pick<AlignedRow, 'status' | 'issues'>>

// Chapter outline entry for the reader. `key` identifies the chapter in
// initialRows and search hits (the chapter id, or a fixed key for the demo).
export interface ReaderChapter {
  key: string
  id?: string
  number: number
  title: string
  done: boolean
}

// Where the reader loads chapters and searches from: the owner's project
// routes, or the shared-link routes where the token is the authorization.
export type ChapterSource =
  | { kind: 'owner'; projectId: string }
  | { kind: 'public'; token: string }

export function chapterUrl(source: ChapterSource, chapterId: string): string {
  return source.kind === 'owner'
    ? `/api/projects/${source.projectId}/chapters/${chapterId}`
    : `/api/read/${source.token}/chunks/${chapterId}`
}

export function searchUrl(source: ChapterSource, query: string): string {
  const q = encodeURIComponent(query)
  return source.kind === 'owner'
    ? `/api/projects/${source.projectId}/search?q=${q}`
    : `/api/read/${source.token}/search?q=${q}`
}

export interface SearchHit {
  chapterId: string
  chapterNumber: number
  chapterTitle: string
  index: number
  snippet: string
}

export const SEARCH_QUERY_MIN = 2
export const SEARCH_QUERY_MAX = 100

// The text around the first case-insensitive match of query, with … where cut.
export function makeSnippet(text: string, query: string, radius = 60): string {
  const at = text.toLowerCase().indexOf(query.toLowerCase())
  if (at < 0) {
    return text.length > radius * 2 ? `${text.slice(0, radius * 2)}…` : text
  }
  const start = Math.max(0, at - radius)
  const end = Math.min(text.length, at + query.length + radius)
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`
}
