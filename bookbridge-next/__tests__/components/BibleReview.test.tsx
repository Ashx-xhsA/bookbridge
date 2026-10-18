/**
 * Book-bible review page (client) and the project-page nudge. The bible is
 * one book overview; names live in the glossary, not here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const mockRefresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), refresh: mockRefresh })),
}))
vi.mock('lucide-react', () => {
  const Icon = () => <svg />
  return { CheckCircle2: Icon, Loader2: Icon, RefreshCw: Icon, Search: Icon, Square: Icon, Plus: Icon, Trash2: Icon, Sparkles: Icon }
})
const mockPollJob = vi.fn()
vi.mock('@/lib/jobPoll', () => ({ pollJob: (...a: unknown[]) => mockPollJob(...a) }))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import BibleReview from '@/app/dashboard/projects/[id]/bible/BibleReview'
import BibleNudge from '@/app/dashboard/projects/[id]/BibleNudge'

const PROJECT_ID = 'proj1'

const ok = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }))

function lastCall() {
  const [url, init] = mockFetch.mock.calls.at(-1) as [string, RequestInit | undefined]
  return { url, method: init?.method, body: init?.body ? JSON.parse(init.body as string) : undefined }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockPollJob.mockResolvedValue({ id: 'job1', status: 'SUCCEEDED' })
  // Scanning asks first (it is slow and costs API credits).
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

const SCAN_URL = `/api/projects/${PROJECT_ID}/bible/scan`

describe('BibleReview', () => {
  it('offers an optional scan and lets you write notes before any scan', () => {
    render(<BibleReview projectId={PROJECT_ID} bible={null} />)
    expect(screen.getByText('Not scanned yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /scan book/i })).toBeEnabled()
    expect(screen.getByLabelText('Translation notes')).toHaveValue('')
  })

  it('saves notes written before any scan', async () => {
    mockFetch.mockReturnValueOnce(ok({ bible: { status: 'NONE', styleGuide: '- 保留敬称' } }))
    render(<BibleReview projectId={PROJECT_ID} bible={null} />)
    const box = screen.getByLabelText('Translation notes')
    fireEvent.change(box, { target: { value: '- 保留敬称' } })
    fireEvent.blur(box)
    await waitFor(() =>
      expect(lastCall()).toMatchObject({ method: 'PATCH', body: { styleGuide: '- 保留敬称' } })
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('starts a scan, polls the job and refreshes', async () => {
    mockFetch.mockReturnValueOnce(ok({ id: 'job1', status: 'PENDING' }, 202))
    render(<BibleReview projectId={PROJECT_ID} bible={null} />)
    fireEvent.click(screen.getByRole('button', { name: /scan book/i }))
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled())
    expect(mockFetch).toHaveBeenCalledWith(SCAN_URL, expect.objectContaining({ method: 'POST' }))
    expect(mockPollJob).toHaveBeenCalledWith('job1', expect.any(Object))
  })

  it('shows the API error when a scan cannot start', async () => {
    mockFetch.mockReturnValueOnce(ok({ error: 'An API key is required to scan the book.' }, 402))
    render(<BibleReview projectId={PROJECT_ID} bible={null} />)
    fireEvent.click(screen.getByRole('button', { name: /scan book/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('API key is required')
  })

  it('resumes polling when opened during a scan', async () => {
    render(
      <BibleReview
        projectId={PROJECT_ID}
        bible={{ status: 'NONE', scanStatus: 'SCANNING', styleGuide: '', jobId: 'job9' }}
      />
    )
    expect(screen.getByRole('button', { name: /scanning/i })).toBeDisabled()
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled())
    expect(mockPollJob).toHaveBeenCalledWith('job9', expect.any(Object))
  })

  it('keeps the bible editable during a re-scan', () => {
    render(
      <BibleReview
        projectId={PROJECT_ID}
        bible={{ status: 'CONFIRMED', scanStatus: 'SCANNING', styleGuide: '- 简洁', jobId: 'job9' }}
      />
    )
    expect(screen.getByRole('button', { name: /scanning/i })).toBeDisabled()
    expect(screen.getByLabelText('Translation notes')).toBeInTheDocument()
    expect(screen.getByText('Confirmed')).toBeInTheDocument()
  })

  it('reports a failed re-scan without hiding the current bible', () => {
    render(
      <BibleReview
        projectId={PROJECT_ID}
        bible={{ status: 'DRAFT', scanStatus: 'FAILED', styleGuide: '', jobId: null }}
      />
    )
    expect(screen.getByText(/last scan failed/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /re-scan/i })).toBeEnabled()
    expect(screen.getByLabelText('Translation notes')).toBeInTheDocument()
  })

  it('shows only the book overview: no character, place or term sections', () => {
    render(
      <BibleReview
        projectId={PROJECT_ID}
        bible={{ status: 'DRAFT', scanStatus: 'IDLE', styleGuide: 'A quest to destroy a ring.', jobId: null }}
      />
    )
    expect(screen.getByLabelText('Translation notes')).toHaveValue('A quest to destroy a ring.')
    expect(screen.queryByText(/characters \(/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/places and terms/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/search names/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/voice of/i)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /glossary/i })).toHaveAttribute(
      'href',
      `/dashboard/projects/${PROJECT_ID}/glossary`
    )
  })

  it('confirms a draft bible', async () => {
    mockFetch.mockReturnValueOnce(ok({ bible: { status: 'CONFIRMED', styleGuide: '- 简洁' } }))
    render(
      <BibleReview
        projectId={PROJECT_ID}
        bible={{ status: 'DRAFT', scanStatus: 'IDLE', styleGuide: '- 简洁', jobId: null }}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /confirm bible/i }))
    expect(await screen.findByText('Confirmed')).toBeInTheDocument()
    expect(lastCall()).toMatchObject({ method: 'PATCH', body: { status: 'CONFIRMED' } })
  })

  it('saves the overview on blur only when changed', async () => {
    mockFetch.mockReturnValueOnce(ok({ bible: { status: 'DRAFT', styleGuide: '- 克制' } }))
    render(
      <BibleReview
        projectId={PROJECT_ID}
        bible={{ status: 'DRAFT', scanStatus: 'IDLE', styleGuide: '- 简洁', jobId: null }}
      />
    )
    const box = screen.getByLabelText('Translation notes')
    fireEvent.blur(box)
    expect(mockFetch).not.toHaveBeenCalled()
    fireEvent.change(box, { target: { value: '- 克制' } })
    fireEvent.blur(box)
    await waitFor(() => expect(lastCall().body).toEqual({ styleGuide: '- 克制' }))
  })

})

describe('BibleReview — scan time, progress and stop', () => {
  const scanning = { status: 'NONE', scanStatus: 'SCANNING', styleGuide: '', jobId: 'job9' }

  it('warns how long a scan takes and what it costs, sized to this book', () => {
    render(<BibleReview projectId={PROJECT_ID} bible={null} sourceChars={796_213} />)
    const note = screen.getByRole('note')
    expect(note).toHaveTextContent('68 model calls')
    expect(note).toHaveTextContent('12–29 minutes')
    expect(note).toHaveTextContent(/translating works without/i)
  })

  it('asks before scanning and does nothing when the user cancels', () => {
    vi.mocked(window.confirm).mockReturnValueOnce(false)
    render(<BibleReview projectId={PROJECT_ID} bible={null} sourceChars={796_213} />)
    fireEvent.click(screen.getByRole('button', { name: /scan book/i }))
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('12–29 minutes'))
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('shows live progress while scanning', async () => {
    mockFetch.mockReturnValue(
      ok({ bible: { ...scanning, scanDone: 30, scanTotal: 69, scanLost: false } })
    )
    render(
      <BibleReview
        projectId={PROJECT_ID}
        bible={{ ...scanning, scanDone: 23, scanTotal: 69, scanLost: false }}
      />
    )
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '23')
    await waitFor(() => expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '30'))
    expect(screen.getByText(/30 \/ 69/)).toBeInTheDocument()
    expect(mockFetch).toHaveBeenCalledWith(`/api/projects/${PROJECT_ID}/bible`, expect.anything())
  })

  it('stops a running scan after confirming', async () => {
    mockFetch.mockImplementation((url: string, init?: RequestInit) =>
      init?.method === 'DELETE'
        ? ok({ bible: { scanStatus: 'IDLE' } })
        : ok({ bible: { ...scanning, scanDone: 1, scanTotal: 69, scanLost: false } })
    )
    render(<BibleReview projectId={PROJECT_ID} bible={{ ...scanning, scanDone: 1, scanTotal: 69 }} />)
    fireEvent.click(screen.getByRole('button', { name: /stop scan/i }))
    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(SCAN_URL, expect.objectContaining({ method: 'DELETE' }))
    )
    expect(window.confirm).toHaveBeenCalled()
    expect(await screen.findByRole('button', { name: /scan book/i })).toBeEnabled()
    expect(screen.queryByRole('button', { name: /stop scan/i })).not.toBeInTheDocument()
  })

  it('shows a scan that stopped responding and lets the user start again', () => {
    render(<BibleReview projectId={PROJECT_ID} bible={{ ...scanning, scanLost: true }} />)
    expect(screen.getByText(/stopped responding/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /scan book/i })).toBeEnabled()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })
})

describe('BibleNudge', () => {
  it.each([
    [null, null, /optional: add translation notes/i, 'Open book bible'],
    ['NONE', 'FAILED', /scan failed/i, 'Open book bible'],
    ['NONE', 'SCANNING', /being scanned/i, 'Open book bible'],
    ['DRAFT', 'IDLE', /draft/i, 'Review bible'],
    ['DRAFT', 'SCANNING', /draft/i, 'Review bible'],
  ])('status %s / scan %s nudges toward the bible page', (status, scanStatus, text, link) => {
    render(<BibleNudge projectId={PROJECT_ID} status={status} scanStatus={scanStatus} />)
    expect(screen.getByText(text)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: link })).toHaveAttribute(
      'href',
      `/dashboard/projects/${PROJECT_ID}/bible`
    )
  })

  it('stays quiet once the bible is confirmed, even while re-scanning', () => {
    const { container } = render(
      <BibleNudge projectId={PROJECT_ID} status="CONFIRMED" scanStatus="SCANNING" />
    )
    expect(container).toBeEmptyDOMElement()
  })
})
