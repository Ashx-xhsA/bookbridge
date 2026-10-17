import { describe, it, expect } from 'vitest'
import { SEGMENT_ROW, publicRows, toAlignedRows } from '@/lib/reader'

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
