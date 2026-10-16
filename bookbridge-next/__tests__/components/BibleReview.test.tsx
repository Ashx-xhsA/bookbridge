/**
 * Phase 3b — book-bible review page (client) and the project-page nudge.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const mockRefresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), refresh: mockRefresh })),
}))
vi.mock('lucide-react', () => {
  const Icon = () => <svg />
  return { CheckCircle2: Icon, Loader2: Icon, RefreshCw: Icon, Search: Icon, Plus: Icon, Trash2: Icon, Sparkles: Icon }
})
const mockPollJob = vi.fn()
vi.mock('@/lib/jobPoll', () => ({ pollJob: (...a: unknown[]) => mockPollJob(...a) }))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import BibleReview, { type BibleEntry } from '@/app/dashboard/projects/[id]/bible/BibleReview'
import BibleNudge from '@/app/dashboard/projects/[id]/BibleNudge'

const PROJECT_ID = 'proj1'

const gandalf: BibleEntry = {
  id: 'g1',
  english: 'Gandalf',
  translation: '甘道夫',
  category: 'person',
  gender: 'male',
  voice: 'Grave.',
  mentions: 40,
  approved: false,
  userEdited: false,
  aliases: [{ id: 'a1', english: 'Mithrandir', translation: '米斯兰达' }],
}
const shire: BibleEntry = {
  ...gandalf,
  id: 's1',
  english: 'Shire',
  translation: '夏尔',
  category: 'place',
  gender: null,
  voice: null,
  mentions: 12,
  aliases: [],
}

const ok = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }))

function lastCall() {
  const [url, init] = mockFetch.mock.calls.at(-1) as [string, RequestInit]
  return { url, method: init.method, body: init.body ? JSON.parse(init.body as string) : undefined }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockPollJob.mockResolvedValue({ id: 'job1', status: 'SUCCEEDED' })
})

describe('BibleReview', () => {
  it('offers a scan before any bible exists and hides the editor', () => {
    render(<BibleReview projectId={PROJECT_ID} bible={null} entries={[]} />)
    expect(screen.getByText('Not scanned yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /scan book/i })).toBeEnabled()
    expect(screen.queryByLabelText('Style guide')).not.toBeInTheDocument()
  })

  it('starts a scan, polls the job and refreshes', async () => {
    mockFetch.mockReturnValueOnce(ok({ id: 'job1', status: 'PENDING' }, 202))
    render(<BibleReview projectId={PROJECT_ID} bible={null} entries={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /scan book/i }))
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled())
    expect(lastCall()).toMatchObject({ url: `/api/projects/${PROJECT_ID}/bible/scan`, method: 'POST' })
    expect(mockPollJob).toHaveBeenCalledWith('job1', expect.any(Object))
  })

  it('shows the API error when a scan cannot start', async () => {
    mockFetch.mockReturnValueOnce(ok({ error: 'An API key is required to scan the book.' }, 402))
    render(<BibleReview projectId={PROJECT_ID} bible={null} entries={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /scan book/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('API key is required')
  })

  it('resumes polling when opened during a scan', async () => {
    render(
      <BibleReview
        projectId={PROJECT_ID}
        bible={{ status: 'NONE', scanStatus: 'SCANNING', styleGuide: '', jobId: 'job9' }}
        entries={[]}
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
        entries={[gandalf]}
      />
    )
    expect(screen.getByRole('button', { name: /scanning/i })).toBeDisabled()
    expect(screen.getByLabelText('Style guide')).toBeInTheDocument()
    expect(screen.getByText('Confirmed')).toBeInTheDocument()
  })

  it('reports a failed re-scan without hiding the current bible', () => {
    render(
      <BibleReview
        projectId={PROJECT_ID}
        bible={{ status: 'DRAFT', scanStatus: 'FAILED', styleGuide: '', jobId: null }}
        entries={[gandalf]}
      />
    )
    expect(screen.getByText(/last scan failed/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /re-scan/i })).toBeEnabled()
    expect(screen.getByLabelText('Voice of Gandalf')).toBeInTheDocument()
  })

  it('splits characters from places and shows aliases', () => {
    render(
      <BibleReview
        projectId={PROJECT_ID}
        bible={{ status: 'DRAFT', scanStatus: 'IDLE', styleGuide: '- 简洁', jobId: null }}
        entries={[gandalf, shire]}
      />
    )
    expect(screen.getByText('Characters (1)')).toBeInTheDocument()
    expect(screen.getByText('Places and terms (1)')).toBeInTheDocument()
    expect(screen.getByText('Mithrandir')).toBeInTheDocument()
    expect(screen.getByLabelText('Voice of Gandalf')).toHaveValue('Grave.')
    expect(screen.queryByLabelText('Voice of Shire')).not.toBeInTheDocument()
  })

  it('confirms a draft bible', async () => {
    mockFetch.mockReturnValueOnce(ok({ bible: { status: 'CONFIRMED', styleGuide: '- 简洁' } }))
    render(
      <BibleReview
        projectId={PROJECT_ID}
        bible={{ status: 'DRAFT', scanStatus: 'IDLE', styleGuide: '- 简洁', jobId: null }}
        entries={[]}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /confirm bible/i }))
    expect(await screen.findByText('Confirmed')).toBeInTheDocument()
    expect(lastCall()).toMatchObject({ method: 'PATCH', body: { status: 'CONFIRMED' } })
  })

  it('saves the style guide on blur only when changed', async () => {
    mockFetch.mockReturnValueOnce(ok({ bible: { status: 'DRAFT', styleGuide: '- 克制' } }))
    render(
      <BibleReview
        projectId={PROJECT_ID}
        bible={{ status: 'DRAFT', scanStatus: 'IDLE', styleGuide: '- 简洁', jobId: null }}
        entries={[]}
      />
    )
    const box = screen.getByLabelText('Style guide')
    fireEvent.blur(box)
    expect(mockFetch).not.toHaveBeenCalled()
    fireEvent.change(box, { target: { value: '- 克制' } })
    fireEvent.blur(box)
    await waitFor(() => expect(lastCall().body).toEqual({ styleGuide: '- 克制' }))
  })

  it('edits voice, gender and an alias translation', async () => {
    mockFetch.mockImplementation(() => ok({ data: {} }))
    render(
      <BibleReview
        projectId={PROJECT_ID}
        bible={{ status: 'DRAFT', scanStatus: 'IDLE', styleGuide: '', jobId: null }}
        entries={[gandalf]}
      />
    )
    const voice = screen.getByLabelText('Voice of Gandalf')
    fireEvent.change(voice, { target: { value: '庄重。' } })
    fireEvent.blur(voice)
    await waitFor(() =>
      expect(lastCall()).toMatchObject({ url: `/api/projects/${PROJECT_ID}/glossary/g1`, body: { voice: '庄重。' } })
    )

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'unknown' } })
    await waitFor(() => expect(lastCall().body).toEqual({ gender: 'unknown' }))

    const alias = screen.getByLabelText('Translation of alias Mithrandir')
    fireEvent.change(alias, { target: { value: '米斯兰迪尔' } })
    fireEvent.blur(alias)
    await waitFor(() =>
      expect(lastCall()).toMatchObject({ url: `/api/projects/${PROJECT_ID}/glossary/a1`, body: { translation: '米斯兰迪尔' } })
    )
  })

  it('adds an alias with its own translation linked to the entry', async () => {
    mockFetch.mockReturnValueOnce(
      ok({ data: { id: 'a2', english: 'the Grey Pilgrim', translation: '灰袍圣徒' } }, 201)
    )
    render(
      <BibleReview
        projectId={PROJECT_ID}
        bible={{ status: 'DRAFT', scanStatus: 'IDLE', styleGuide: '', jobId: null }}
        entries={[gandalf]}
      />
    )
    fireEvent.change(screen.getByLabelText('New alias for Gandalf'), { target: { value: 'the Grey Pilgrim' } })
    fireEvent.change(screen.getByLabelText('Translation of new alias for Gandalf'), {
      target: { value: '灰袍圣徒' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add alias for Gandalf' }))
    expect(await screen.findByText('the Grey Pilgrim')).toBeInTheDocument()
    expect(lastCall()).toMatchObject({
      method: 'POST',
      body: { english: 'the Grey Pilgrim', translation: '灰袍圣徒', category: 'person', aliasOfId: 'g1' },
    })
  })

  it('deletes an alias', async () => {
    mockFetch.mockReturnValueOnce(Promise.resolve(new Response(null, { status: 204 })))
    render(
      <BibleReview
        projectId={PROJECT_ID}
        bible={{ status: 'DRAFT', scanStatus: 'IDLE', styleGuide: '', jobId: null }}
        entries={[gandalf]}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Delete alias Mithrandir' }))
    await waitFor(() => expect(screen.queryByText('Mithrandir')).not.toBeInTheDocument())
    expect(lastCall()).toMatchObject({ url: `/api/projects/${PROJECT_ID}/glossary/a1`, method: 'DELETE' })
  })

  it('filters by name or alias', () => {
    render(
      <BibleReview
        projectId={PROJECT_ID}
        bible={{ status: 'DRAFT', scanStatus: 'IDLE', styleGuide: '', jobId: null }}
        entries={[gandalf, shire]}
      />
    )
    fireEvent.change(screen.getByLabelText('Search names or aliases'), { target: { value: 'mithr' } })
    expect(screen.getByText('Characters (1)')).toBeInTheDocument()
    expect(screen.getByText('Places and terms (0)')).toBeInTheDocument()
  })
})

describe('BibleNudge', () => {
  it.each([
    [null, null, /scan the book first/i, 'Open book bible'],
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
