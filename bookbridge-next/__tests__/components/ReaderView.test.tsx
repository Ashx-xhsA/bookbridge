/**
 * Phase 5b — reader loads chapters one at a time and searches on the server.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))
vi.mock('@/lib/jobPoll', () => ({ pollJob: vi.fn() }))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import ReaderView, { type ReaderChapter } from '@/app/read/[id]/ReaderView'
import type { ReaderRow } from '@/lib/reader'

const chapters: ReaderChapter[] = [
  { key: 'c1', id: 'c1', number: 1, title: 'Morning', done: true },
  { key: 'c2', id: 'c2', number: 2, title: 'Evening', done: false },
]

const issue = { category: 'omission', severity: 'error' as const, message: 'second clause dropped' }
const firstRows: ReaderRow[] = [
  { index: 0, source: 'He woke.', translation: '他醒了。', status: 'flagged', issues: [issue] },
]

function ok(data: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve({ data }) })
}

beforeEach(() => {
  mockFetch.mockReset()
  localStorage.clear()
})

describe('ReaderView', () => {
  it('renders the first chapter and loads another chapter on demand', async () => {
    mockFetch.mockReturnValueOnce(
      ok({ id: 'c2', segments: [{ index: 0, source: 'Night fell.', translation: null }] })
    )
    render(
      <ReaderView
        title="Book"
        sourceLang="English"
        targetLang="中文"
        chapters={chapters}
        initialRows={{ c1: firstRows }}
        source={{ kind: 'owner', projectId: 'p1' }}
      />
    )
    expect(screen.getByText('He woke.')).toBeInTheDocument()
    expect(screen.queryByText('Night fell.')).not.toBeInTheDocument()
    // Chapters show their own titles only; no running number of ours.
    expect(screen.queryByText(/chapter \d/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/^\s*\d+\.\s*$/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /load evening/i }))
    await waitFor(() => expect(screen.getByText('Night fell.')).toBeInTheDocument())
    expect(mockFetch).toHaveBeenCalledWith('/api/projects/p1/chapters/c2')
    expect(screen.getAllByText(/not yet translated/i).length).toBeGreaterThan(0)
  })

  it('shows review issues to the owner', () => {
    render(
      <ReaderView
        title="Book"
        chapters={chapters}
        initialRows={{ c1: firstRows }}
        source={{ kind: 'owner', projectId: 'p1' }}
      />
    )
    expect(screen.getByRole('button', { name: /review issues/i })).toBeInTheDocument()
  })

  it('never shows review markers on a shared link', () => {
    render(
      <ReaderView
        title="Book"
        chapters={chapters}
        initialRows={{ c1: firstRows }}
        source={{ kind: 'public', token: 'tok' }}
      />
    )
    expect(screen.queryByRole('button', { name: /review issues/i })).not.toBeInTheDocument()
  })

  it('searches on the server and jumps to the hit, loading its chapter', async () => {
    mockFetch
      .mockReturnValueOnce(
        ok([{ chapterId: 'c2', chapterNumber: 2, chapterTitle: 'Evening', index: 0, snippet: 'Night fell.' }])
      )
      .mockReturnValueOnce(
        ok({ id: 'c2', segments: [{ index: 0, source: 'Night fell.', translation: '夜幕降临。' }] })
      )
    render(
      <ReaderView
        title="Book"
        chapters={chapters}
        initialRows={{ c1: firstRows }}
        source={{ kind: 'public', token: 'tok' }}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /search/i }))
    const input = screen.getByPlaceholderText(/search/i)
    fireEvent.change(input, { target: { value: 'night' } })
    fireEvent.submit(input.closest('form')!)

    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/read/tok/search?q=night'))
    fireEvent.click(await screen.findByRole('button', { name: /^evening.*night fell/i }))
    await waitFor(() => expect(screen.getByText('夜幕降临。')).toBeInTheDocument())
    expect(mockFetch).toHaveBeenCalledWith('/api/read/tok/chunks/c2')
  })

  it('searches the static demo locally without any request', async () => {
    render(
      <ReaderView
        title="Demo"
        chapters={[{ key: 'd1', number: 1, title: 'The Drawing', done: true }]}
        initialRows={{ d1: [{ index: 0, source: 'A boa constrictor.', translation: '一条蟒蛇。' }] }}
        source={{ kind: 'static' }}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /search/i }))
    const input = screen.getByPlaceholderText(/search/i)
    fireEvent.change(input, { target: { value: 'boa' } })
    fireEvent.submit(input.closest('form')!)
    expect(await screen.findByRole('button', { name: /^the drawing.*boa/i })).toBeInTheDocument()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('offers the owner Markdown and both bilingual EPUB layouts as downloads', () => {
    render(
      <ReaderView
        title="Book"
        chapters={chapters}
        initialRows={{ c1: firstRows }}
        source={{ kind: 'owner', projectId: 'p1' }}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /export/i }))
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual(
      expect.arrayContaining([
        '/api/projects/p1/export?format=md&layout=translation',
        '/api/projects/p1/export?format=md&layout=bilingual',
        '/api/projects/p1/export?format=epub&layout=side',
        '/api/projects/p1/export?format=epub&layout=stacked',
      ])
    )
  })

  it('has no export on a shared link', () => {
    render(
      <ReaderView
        title="Book"
        chapters={chapters}
        initialRows={{ c1: firstRows }}
        source={{ kind: 'public', token: 'tok' }}
      />
    )
    expect(screen.queryByRole('button', { name: /export/i })).not.toBeInTheDocument()
  })
})
