/**
 * Failing (red) tests for issue #30 — GlossaryTable client component.
 *
 * The component at app/components/glossary/GlossaryTable.tsx does not exist
 * yet. All tests below must fail until the green phase.
 *
 * Scope: React Testing Library + mocked fetch. No Prisma / Clerk involved —
 * this is a pure UI layer test.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ---------------------------------------------------------------------------
// next/navigation must be stubbed — component likely uses useRouter for
// refresh after mutations.
// ---------------------------------------------------------------------------
const mockRefresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), refresh: mockRefresh })),
}))

// ---------------------------------------------------------------------------
// lucide-react icons — can't render SVG in jsdom without a stub
// ---------------------------------------------------------------------------
vi.mock('lucide-react', () => ({
  Trash2: () => <svg data-testid="trash-icon" />,
  Pencil: () => <svg data-testid="pencil-icon" />,
  Check: () => <svg data-testid="check-icon" />,
  X: () => <svg data-testid="x-icon" />,
  Plus: () => <svg data-testid="plus-icon" />,
  Search: () => <svg data-testid="search-icon" />,
  Loader2: () => <svg data-testid="loader-icon" />,
}))

import GlossaryTable from '@/app/components/glossary/GlossaryTable'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const PROJECT_ID = 'proj-abc'

type Term = {
  id: string
  english: string
  translation: string | null
  category: string
  approved: boolean
  userEdited: boolean
  notes?: string | null
}

const SAMPLE_TERMS: Term[] = [
  {
    id: 't1',
    english: 'Hermione',
    translation: '赫敏',
    category: 'person',
    approved: true,
    userEdited: true,
  },
  {
    id: 't2',
    english: 'wand',
    translation: '魔杖',
    category: 'technical',
    approved: false,
    userEdited: false,
  },
  {
    id: 't3',
    english: 'Hogwarts',
    translation: '霍格沃茨',
    category: 'place',
    approved: false,
    userEdited: false,
  },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function renderTable(terms: Term[] = SAMPLE_TERMS) {
  return render(<GlossaryTable projectId={PROJECT_ID} initialTerms={terms} />)
}

function mockFetchSuccess(body: unknown, status = 200) {
  vi.mocked(global.fetch).mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  )
}

function mockFetchError(status: number) {
  vi.mocked(global.fetch).mockResolvedValueOnce(
    new Response(JSON.stringify({ error: 'Something went wrong' }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  )
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = vi.fn()
})

// ---------------------------------------------------------------------------
// 1. Basic rendering
// ---------------------------------------------------------------------------
describe('GlossaryTable — rendering', () => {
  it('renders all term rows with english, translation, category, and approved columns', () => {
    renderTable()

    expect(screen.getByText('Hermione')).toBeInTheDocument()
    expect(screen.getByText('赫敏')).toBeInTheDocument()
    expect(screen.getByText('person')).toBeInTheDocument()

    expect(screen.getByText('wand')).toBeInTheDocument()
    expect(screen.getByText('魔杖')).toBeInTheDocument()
    expect(screen.getByText('technical')).toBeInTheDocument()
  })

  it('renders approved rows with a checked checkbox', () => {
    renderTable()

    // Hermione (t1) is approved — its checkbox should be checked
    const rows = screen.getAllByRole('row')
    const hermioneRow = rows.find((r) => within(r).queryByText('Hermione'))
    expect(hermioneRow).toBeDefined()
    const checkbox = within(hermioneRow!).getByRole('checkbox')
    expect(checkbox).toBeChecked()
  })

  it('applies .unreviewed class (or data-unreviewed attribute) to rows where userEdited=false AND approved=false', () => {
    renderTable()

    // wand (t2) and Hogwarts (t3) are userEdited=false + approved=false
    const rows = screen.getAllByRole('row')
    const unreviewedRows = rows.filter(
      (r) =>
        r.classList.contains('unreviewed') ||
        r.dataset.unreviewed === 'true' ||
        r.dataset.unreviewed === ''
    )
    // At least 2 rows must carry the unreviewed marker
    expect(unreviewedRows.length).toBeGreaterThanOrEqual(2)
  })
})

// ---------------------------------------------------------------------------
// 2. Add term form
// ---------------------------------------------------------------------------
describe('GlossaryTable — add term form', () => {
  it('POSTs to /api/projects/[id]/glossary and adds returned row to the table', async () => {
    const newTerm: Term = {
      id: 't99',
      english: 'broomstick',
      translation: '飞天扫帚',
      category: 'technical',
      approved: false,
      userEdited: false,
    }
    mockFetchSuccess({ data: newTerm }, 201)

    renderTable()

    // Fill in the add-term form
    const englishInput = screen.getByPlaceholderText(/english/i)
    const translationInput = screen.getByPlaceholderText(/translation/i)
    const addButton = screen.getByRole('button', { name: /add term/i })

    fireEvent.change(englishInput, { target: { value: 'broomstick' } })
    fireEvent.change(translationInput, { target: { value: '飞天扫帚' } })
    fireEvent.click(addButton)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/projects/${PROJECT_ID}/glossary`,
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('broomstick'),
        })
      )
    })

    expect(await screen.findByText('broomstick')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// 3. Inline edit of translation
// ---------------------------------------------------------------------------
describe('GlossaryTable — inline edit translation', () => {
  it('clicking the translation cell swaps to an input', async () => {
    renderTable()

    const translationCell = screen.getByText('赫敏')
    fireEvent.click(translationCell)

    // An input field should now be visible with the current value
    const input = await screen.findByDisplayValue('赫敏')
    expect(input).toBeInTheDocument()
  })

  it('blurring the input sends PATCH and shows the new value in the row', async () => {
    const updated: Term = {
      ...SAMPLE_TERMS[0],
      translation: '赫敏·格兰杰',
      userEdited: true,
    }
    mockFetchSuccess({ data: updated })

    renderTable()

    const translationCell = screen.getByText('赫敏')
    fireEvent.click(translationCell)

    const input = await screen.findByDisplayValue('赫敏')
    fireEvent.change(input, { target: { value: '赫敏·格兰杰' } })
    fireEvent.blur(input)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/projects/${PROJECT_ID}/glossary/${SAMPLE_TERMS[0].id}`,
        expect.objectContaining({
          method: 'PATCH',
          body: expect.stringContaining('赫敏·格兰杰'),
        })
      )
    })

    expect(await screen.findByText('赫敏·格兰杰')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// 4. Approve checkbox
// ---------------------------------------------------------------------------
describe('GlossaryTable — approve checkbox', () => {
  it('toggling the approve checkbox sends PATCH with { approved: true }', async () => {
    const updated: Term = { ...SAMPLE_TERMS[1], approved: true }
    mockFetchSuccess({ data: updated })

    renderTable()

    // wand (t2) is unapproved — find its row and checkbox
    const rows = screen.getAllByRole('row')
    const wandRow = rows.find((r) => within(r).queryByText('wand'))
    expect(wandRow).toBeDefined()
    const checkbox = within(wandRow!).getByRole('checkbox')

    fireEvent.click(checkbox)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/projects/${PROJECT_ID}/glossary/${SAMPLE_TERMS[1].id}`,
        expect.objectContaining({
          method: 'PATCH',
          body: expect.stringContaining('"approved":true'),
        })
      )
    })

    // The checkbox must now appear checked
    await waitFor(() => {
      expect(checkbox).toBeChecked()
    })
  })
})

// ---------------------------------------------------------------------------
// 5. Delete flow
// ---------------------------------------------------------------------------
describe('GlossaryTable — delete flow', () => {
  it('clicking the trash icon opens a confirmation UI', async () => {
    renderTable()

    const trashButtons = screen.getAllByTestId('trash-icon')
    // Click the trash icon of the first row
    fireEvent.click(trashButtons[0].closest('button')!)

    // A confirm button (or dialog) must appear
    expect(
      await screen.findByRole('button', { name: /confirm/i })
    ).toBeInTheDocument()
  })

  it('confirming delete sends DELETE request and removes the row', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(null, { status: 204 })
    )

    renderTable()

    // Click trash icon of Hermione row (t1)
    const rows = screen.getAllByRole('row')
    const hermioneRow = rows.find((r) => within(r).queryByText('Hermione'))
    const trashButton = within(hermioneRow!).getByTestId('trash-icon').closest('button')!
    fireEvent.click(trashButton)

    const confirmButton = await screen.findByRole('button', { name: /confirm/i })
    fireEvent.click(confirmButton)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/projects/${PROJECT_ID}/glossary/${SAMPLE_TERMS[0].id}`,
        expect.objectContaining({ method: 'DELETE' })
      )
    })

    // Row must be removed from the DOM
    await waitFor(() => {
      expect(screen.queryByText('Hermione')).not.toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// 6. Optimistic UI rollback on PATCH failure
// ---------------------------------------------------------------------------
describe('GlossaryTable — optimistic rollback', () => {
  it('rolls back to the previous translation value and shows a toast on PATCH failure', async () => {
    mockFetchError(500)

    renderTable()

    // Click translation cell for Hermione
    const translationCell = screen.getByText('赫敏')
    fireEvent.click(translationCell)

    const input = await screen.findByDisplayValue('赫敏')
    fireEvent.change(input, { target: { value: '错误翻译' } })
    fireEvent.blur(input)

    // Wait for fetch to be called and then for the rollback
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/projects/${PROJECT_ID}/glossary/${SAMPLE_TERMS[0].id}`,
        expect.objectContaining({ method: 'PATCH' })
      )
    })

    // Old value must be restored after the error
    await waitFor(() => {
      expect(screen.queryByText('错误翻译')).not.toBeInTheDocument()
      expect(screen.getByText('赫敏')).toBeInTheDocument()
    })

    // A toast / error message must appear — look for common patterns
    const toast = await screen.findByRole('alert')
    expect(toast).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// 7. Filter bar
// ---------------------------------------------------------------------------
describe('GlossaryTable — filter bar', () => {
  it('typing in the search input narrows visible rows without a network call', async () => {
    renderTable()

    const searchInput = screen.getByRole('searchbox')
    // Filter to only show rows matching "wand"
    fireEvent.change(searchInput, { target: { value: 'wand' } })

    // wand should be visible; Hermione and Hogwarts should not
    expect(screen.getByText('wand')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByText('Hermione')).not.toBeInTheDocument()
      expect(screen.queryByText('Hogwarts')).not.toBeInTheDocument()
    })

    // No network call should have been made for the filter
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('clearing the search input shows all rows again', async () => {
    renderTable()

    const searchInput = screen.getByRole('searchbox')
    fireEvent.change(searchInput, { target: { value: 'wand' } })
    fireEvent.change(searchInput, { target: { value: '' } })

    expect(screen.getByText('Hermione')).toBeInTheDocument()
    expect(screen.getByText('wand')).toBeInTheDocument()
    expect(screen.getByText('Hogwarts')).toBeInTheDocument()
  })
})
