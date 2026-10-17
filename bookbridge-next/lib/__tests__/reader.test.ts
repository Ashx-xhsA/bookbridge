import { describe, it, expect } from 'vitest'
import {
  SEGMENT_ROW,
  chapterUrl,
  makeSnippet,
  publicRows,
  searchUrl,
  textToRows,
  toAlignedRows,
} from '@/lib/reader'

const issue = { category: 'mistranslation', severity: 'error', message: 'pick at ≠ 挑着吃' }

describe('toAlignedRows', () => {
  it('keeps untranslated segments in place instead of skipping them', () => {
    const rows = toAlignedRows([
      { index: 0, source: 'A.', translation: '甲', status: 'translated', reviewIssues: [] },
      { index: 1, source: 'B.', translation: null, status: 'pending', reviewIssues: [] },
      { index: 2, source: 'C.', translation: '丙', status: 'reviewed', reviewIssues: [] },
    ])
    expect(rows.map((r) => [r.index, r.source, r.translation])).toEqual([
      [0, 'A.', '甲'],
      [1, 'B.', null],
      [2, 'C.', '丙'],
    ])
  })

  it('carries status and the open review issues of each segment', () => {
    const [row] = toAlignedRows([
      { index: 0, source: 'A.', translation: '甲', status: 'flagged', reviewIssues: [issue] },
    ])
    expect(row.status).toBe('flagged')
    expect(row.issues).toEqual([issue])
  })

  it('keeps a failed segment as failed with its old text', () => {
    const [row] = toAlignedRows([
      { index: 0, source: 'A.', translation: '旧', status: 'failed', reviewIssues: [] },
    ])
    expect(row).toMatchObject({ status: 'failed', translation: '旧' })
  })

  it('drops malformed review issues and treats an unknown status as pending', () => {
    const [row] = toAlignedRows([
      {
        index: 0,
        source: 'A.',
        translation: null,
        status: 'weird',
        reviewIssues: [issue, { severity: 'error' }, 'junk'],
      },
    ])
    expect(row.status).toBe('pending')
    expect(row.issues).toEqual([issue])
  })

  it('treats a non-array reviewIssues value as no issues', () => {
    const [row] = toAlignedRows([
      { index: 0, source: 'A.', translation: '甲', status: 'translated', reviewIssues: null },
    ])
    expect(row.issues).toEqual([])
  })
})

describe('publicRows', () => {
  it('exposes only index, source and translation (no review details)', () => {
    const rows = toAlignedRows([
      { index: 0, source: 'A.', translation: '甲', status: 'flagged', reviewIssues: [issue] },
      { index: 1, source: 'B.', translation: null, status: 'pending', reviewIssues: [] },
    ])
    expect(publicRows(rows)).toEqual([
      { index: 0, source: 'A.', translation: '甲' },
      { index: 1, source: 'B.', translation: null },
    ])
  })
})

describe('SEGMENT_ROW', () => {
  it('selects the fields the aligned view needs, in reading order', () => {
    expect(SEGMENT_ROW.select).toEqual({
      index: true,
      source: true,
      translation: true,
      status: true,
      reviewIssues: true,
    })
    expect(SEGMENT_ROW.orderBy).toEqual({ index: 'asc' })
  })
})

describe('chapterUrl / searchUrl', () => {
  it('uses the owner routes for an owner reader', () => {
    const src = { kind: 'owner', projectId: 'p1' } as const
    expect(chapterUrl(src, 'c1')).toBe('/api/projects/p1/chapters/c1')
    expect(searchUrl(src, 'old man')).toBe('/api/projects/p1/search?q=old%20man')
  })

  it('uses the token routes for a shared-link reader', () => {
    const src = { kind: 'public', token: 'tok' } as const
    expect(chapterUrl(src, 'c1')).toBe('/api/read/tok/chunks/c1')
    expect(searchUrl(src, 'a&b')).toBe('/api/read/tok/search?q=a%26b')
  })

  it('has no URLs for the static demo', () => {
    const src = { kind: 'static' } as const
    expect(chapterUrl(src, 'c1')).toBeNull()
    expect(searchUrl(src, 'x')).toBeNull()
  })
})

describe('textToRows', () => {
  it('pairs paragraphs by position and pads a shorter translation with null', () => {
    expect(textToRows('A.\n\nB.\n\nC.', '甲\n\n乙')).toEqual([
      { index: 0, source: 'A.', translation: '甲' },
      { index: 1, source: 'B.', translation: '乙' },
      { index: 2, source: 'C.', translation: null },
    ])
  })
})

describe('makeSnippet', () => {
  it('returns the text around the first case-insensitive match', () => {
    const text = 'x'.repeat(100) + ' Gregor woke up ' + 'y'.repeat(100)
    const snippet = makeSnippet(text, 'GREGOR', 10)
    expect(snippet).toContain('Gregor')
    expect(snippet.startsWith('…')).toBe(true)
    expect(snippet.endsWith('…')).toBe(true)
    expect(snippet.length).toBeLessThan(40)
  })

  it('returns the start of the text when there is no match', () => {
    expect(makeSnippet('short text', 'zzz', 10)).toBe('short text')
  })
})
