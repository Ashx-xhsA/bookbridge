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
  return { CheckCircle2: Icon, Loader2: Icon, RefreshCw: Icon, Search: Icon, Square: Icon, Plus: Icon, Trash2: Icon, Sparkles: Icon }
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

// Split entries into the two paged groups the page passes in.
function pages(...entries: BibleEntry[]) {
  const group = (list: BibleEntry[]) => ({ entries: list, total: list.length, nextCursor: null })
  return {
    people: group(entries.filter((e) => e.category === 'person')),
    others: group(entries.filter((e) => e.category !== 'person')),
  }
}

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
  it('offers a scan before any bible exists and hides the editor', () => {
    render(<BibleReview projectId={PROJECT_ID} bible={null} {...pages()} />)
    expect(screen.getByText('Not scanned yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /scan book/i })).toBeEnabled()
    expect(screen.queryByLabelText('Style guide')).not.toBeInTheDocument()
  })

  it('starts a scan, polls the job and refreshes', async () => {
    mockFetch.mockReturnValueOnce(ok({ id: 'job1', status: 'PENDING' }, 202))
    render(<BibleReview projectId={PROJECT_ID} bible={null} {...pages()} />)
    fireEvent.click(screen.getByRole('button', { name: /scan book/i }))
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled())
    expect(mockFetch).toHaveBeenCalledWith(SCAN_URL, expect.objectContaining({ method: 'POST' }))
    expect(mockPollJob).toHaveBeenCalledWith('job1', expect.any(Object))
  })

  it('shows the API error when a scan cannot start', async () => {
    mockFetch.mockReturnValueOnce(ok({ error: 'An API key is required to scan the book.' }, 402))
    render(<BibleReview projectId={PROJECT_ID} bible={null} {...pages()} />)
    fireEvent.click(screen.getByRole('button', { name: /scan book/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('API key is required')
  })

  it('resumes polling when opened during a scan', async () => {
    render(
      <BibleReview
        projectId={PROJECT_ID}
        bible={{ status: 'NONE', scanStatus: 'SCANNING', styleGuide: '', jobId: 'job9' }}
        {...pages()}
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
        {...pages(gandalf)}
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
        {...pages(gandalf)}
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
        {...pages(gandalf, shire)}
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
        {...pages()}
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
        {...pages()}
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
        {...pages(gandalf)}
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
        {...pages(gandalf)}
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
        {...pages(gandalf)}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Delete alias Mithrandir' }))
    await waitFor(() => expect(screen.queryByText('Mithrandir')).not.toBeInTheDocument())
    expect(lastCall()).toMatchObject({ url: `/api/projects/${PROJECT_ID}/glossary/a1`, method: 'DELETE' })
  })

  it('searches names and aliases on the server', async () => {
    mockFetch
      .mockReturnValueOnce(ok({ data: [gandalf], total: 1, nextCursor: null }))
      .mockReturnValueOnce(ok({ data: [], total: 0, nextCursor: null }))
    render(
      <BibleReview
        projectId={PROJECT_ID}
        bible={{ status: 'DRAFT', scanStatus: 'IDLE', styleGuide: '', jobId: null }}
        {...pages(gandalf, shire)}
      />
    )
    const input = screen.getByLabelText('Search names or aliases')
    fireEvent.change(input, { target: { value: 'mithr' } })
    fireEvent.submit(input.closest('form')!)
    await waitFor(() => expect(screen.getByText('Places and terms (0)')).toBeInTheDocument())
    expect(screen.getByText('Characters (1)')).toBeInTheDocument()
    const urls = mockFetch.mock.calls.map(([url]) => url as string)
    expect(urls).toContain(`/api/projects/${PROJECT_ID}/bible/entries?group=person&q=mithr`)
    expect(urls).toContain(`/api/projects/${PROJECT_ID}/bible/entries?group=other&q=mithr`)
  })

  it('shows the total and loads more entries of a group on demand', async () => {
    const frodo: BibleEntry = { ...gandalf, id: 'f1', english: 'Frodo', translation: '弗罗多', aliases: [] }
    mockFetch.mockReturnValueOnce(ok({ data: [frodo], total: 2, nextCursor: null }))
    render(
      <BibleReview
        projectId={PROJECT_ID}
        bible={{ status: 'DRAFT', scanStatus: 'IDLE', styleGuide: '', jobId: null }}
        people={{ entries: [gandalf], total: 2, nextCursor: 'g1' }}
        others={{ entries: [], total: 0, nextCursor: null }}
      />
    )
    expect(screen.getByText('Characters (2)')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /show more characters/i }))
    await waitFor(() => expect(screen.getByLabelText('Voice of Frodo')).toBeInTheDocument())
    expect(lastCall().url).toBe(`/api/projects/${PROJECT_ID}/bible/entries?group=person&cursor=g1`)
    expect(screen.getByLabelText('Voice of Gandalf')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /show more characters/i })).not.toBeInTheDocument()
  })
})

describe('BibleReview — scan time, progress and stop', () => {
  const scanning = { status: 'NONE', scanStatus: 'SCANNING', styleGuide: '', jobId: 'job9' }

  it('warns how long a scan takes and what it costs, sized to this book', () => {
    render(<BibleReview projectId={PROJECT_ID} bible={null} sourceChars={796_213} {...pages()} />)
    const note = screen.getByRole('note')
    expect(note).toHaveTextContent('69 model calls')
    expect(note).toHaveTextContent('12–29 minutes')
    expect(note).toHaveTextContent(/translating works without/i)
  })

  it('asks before scanning and does nothing when the user cancels', () => {
    vi.mocked(window.confirm).mockReturnValueOnce(false)
    render(<BibleReview projectId={PROJECT_ID} bible={null} sourceChars={796_213} {...pages()} />)
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
        {...pages()}
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
    render(<BibleReview projectId={PROJECT_ID} bible={{ ...scanning, scanDone: 1, scanTotal: 69 }} {...pages()} />)
    fireEvent.click(screen.getByRole('button', { name: /stop scan/i }))
    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(SCAN_URL, expect.objectContaining({ method: 'DELETE' }))
    )
    expect(window.confirm).toHaveBeenCalled()
    expect(await screen.findByRole('button', { name: /scan book/i })).toBeEnabled()
    expect(screen.queryByRole('button', { name: /stop scan/i })).not.toBeInTheDocument()
  })

  it('shows a scan that stopped responding and lets the user start again', () => {
    render(<BibleReview projectId={PROJECT_ID} bible={{ ...scanning, scanLost: true }} {...pages()} />)
    expect(screen.getByText(/stopped responding/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /scan book/i })).toBeEnabled()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
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
