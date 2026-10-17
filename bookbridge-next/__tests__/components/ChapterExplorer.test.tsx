/**
 * Phase 5c — the project page lists chapters without their text and loads a
 * chapter's paragraphs only when it is selected.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))
vi.mock('@/lib/jobPoll', () => ({ pollJob: vi.fn() }))
vi.mock('@/app/dashboard/projects/[id]/SummaryButton', () => ({
  default: () => <button>Summarize</button>,
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import ChapterExplorer from '@/app/dashboard/projects/[id]/ChapterExplorer'

const chapters = [
  { id: 'c1', number: 1, title: 'Morning', paragraphCount: 2, translated: true, flaggedCount: 1, summary: null },
  { id: 'c2', number: 2, title: 'Evening', paragraphCount: 1, translated: false, flaggedCount: 0, summary: null },
]

const issue = { category: 'omission', severity: 'error', message: 'second clause dropped' }

function ok(data: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve({ data }) })
}

beforeEach(() => mockFetch.mockReset())

describe('ChapterExplorer', () => {
  it('loads the selected chapter and shows its paragraphs aligned, with review issues', async () => {
    mockFetch.mockReturnValueOnce(
      ok({
        id: 'c1',
        segments: [
          { index: 0, source: 'He woke.', translation: '他醒了。', status: 'reviewed', issues: [] },
          { index: 1, source: 'He rose.', translation: '他起身。', status: 'flagged', issues: [issue] },
        ],
      })
    )
    render(<ChapterExplorer chapters={chapters} jobs={[]} projectId="p1" />)
    await waitFor(() => expect(screen.getByText('他醒了。')).toBeInTheDocument())
    expect(mockFetch).toHaveBeenCalledWith('/api/projects/p1/chapters/c1')
    expect(screen.getByText(/1 need review/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /review issues/i }))
    expect(screen.getByText('second clause dropped')).toBeInTheDocument()
  })

  it('fetches another chapter when it is selected', async () => {
    mockFetch
      .mockReturnValueOnce(ok({ id: 'c1', segments: [] }))
      .mockReturnValueOnce(
        ok({ id: 'c2', segments: [{ index: 0, source: 'Night fell.', translation: null, status: 'pending', issues: [] }] })
      )
    render(<ChapterExplorer chapters={chapters} jobs={[]} projectId="p1" />)
    fireEvent.click(screen.getByRole('button', { name: /^evening/i }))
    await waitFor(() => expect(screen.getByText('Night fell.')).toBeInTheDocument())
    expect(mockFetch).toHaveBeenLastCalledWith('/api/projects/p1/chapters/c2')
  })

  it('lists chapters by their own titles, without our running numbers', () => {
    mockFetch.mockReturnValue(ok({ id: 'c1', segments: [] }))
    render(<ChapterExplorer chapters={chapters} jobs={[]} projectId="p1" />)
    expect(screen.getByRole('button', { name: /^morning/i })).toBeInTheDocument()
    expect(screen.queryByText(/^\s*1\.\s*morning/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/chapter 1\b/i)).not.toBeInTheDocument()
  })

  it('has no per-chapter Translate button: chapters are picked in the list', async () => {
    mockFetch.mockReturnValue(ok({ id: 'c2', segments: [] }))
    render(<ChapterExplorer chapters={chapters} jobs={[]} projectId="p1" />)
    fireEvent.click(screen.getByRole('button', { name: /^evening/i }))
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/projects/p1/chapters/c2'))
    expect(screen.queryByRole('button', { name: /^translate$/i })).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /select evening/i })).toBeInTheDocument()
  })

  it('offers Translate All for untranslated chapters that have paragraphs', () => {
    mockFetch.mockReturnValue(ok({ id: 'c1', segments: [] }))
    render(<ChapterExplorer chapters={chapters} jobs={[]} projectId="p1" />)
    expect(screen.getByRole('button', { name: /translate all \(1\)/i })).toBeInTheDocument()
  })
})
