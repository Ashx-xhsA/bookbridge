/**
 * Phase 5b — one paragraph of the aligned reader.
 */
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SegmentRow from '@/app/read/[id]/SegmentRow'
import type { ReaderRow } from '@/lib/reader'

const issue = { category: 'omission', severity: 'error' as const, message: 'second clause dropped' }

function row(overrides: Partial<ReaderRow> = {}): ReaderRow {
  return { index: 0, source: 'He woke.', translation: '他醒了。', status: 'translated', issues: [], ...overrides }
}

function renderRow(r: ReaderRow, mode: 'bilingual' | 'translation' | 'source' = 'bilingual', showIssues = true) {
  return render(<SegmentRow row={r} mode={mode} showIssues={showIssues} anchorId="seg-c1-0" />)
}

describe('SegmentRow', () => {
  it('shows source and translation side by side in one row', () => {
    const { container } = renderRow(row())
    expect(screen.getByText('He woke.')).toBeInTheDocument()
    expect(screen.getByText('他醒了。')).toBeInTheDocument()
    expect(container.querySelector('#seg-c1-0')).not.toBeNull()
  })

  it('keeps the place of an untranslated paragraph', () => {
    renderRow(row({ translation: null, status: 'pending' }))
    expect(screen.getByText('He woke.')).toBeInTheDocument()
    expect(screen.getByText(/not yet translated/i)).toBeInTheDocument()
  })

  it('marks a failed paragraph', () => {
    renderRow(row({ status: 'failed' }))
    expect(screen.getByText(/translation failed/i)).toBeInTheDocument()
  })

  it('lets the owner open the review issues of a flagged paragraph', () => {
    renderRow(row({ status: 'flagged', issues: [issue] }))
    expect(screen.queryByText('second clause dropped')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /review issues/i }))
    expect(screen.getByText('second clause dropped')).toBeInTheDocument()
    expect(screen.getByText(/omission/i)).toBeInTheDocument()
  })

  it('shows no review marker when issues are hidden (shared link)', () => {
    renderRow(row({ status: 'flagged', issues: [issue] }), 'bilingual', false)
    expect(screen.queryByRole('button', { name: /review issues/i })).not.toBeInTheDocument()
    expect(screen.queryByText('second clause dropped')).not.toBeInTheDocument()
  })

  it('shows only the translation in translation mode', () => {
    renderRow(row(), 'translation')
    expect(screen.getByText('他醒了。')).toBeInTheDocument()
    expect(screen.queryByText('He woke.')).not.toBeInTheDocument()
  })

  it('shows only the source in source mode', () => {
    renderRow(row(), 'source')
    expect(screen.getByText('He woke.')).toBeInTheDocument()
    expect(screen.queryByText('他醒了。')).not.toBeInTheDocument()
  })
})
