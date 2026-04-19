/**
 * Failing (red) tests for issue #57:
 * "S4-7 Publish flow UI — /read/[token] public reader page"
 *
 * Tests the Server Component page at:
 *   app/read/[token]/page.tsx
 *
 * The file does NOT exist yet — all tests must fail until it is implemented.
 *
 * Pattern: await the async default export, then render the returned JSX.
 * This mirrors the pattern used in __tests__/page.test.tsx for the landing page.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock next/navigation — notFound() throws internally in Next; stub it as a spy
vi.mock('next/navigation', () => ({
  notFound: vi.fn(),
  redirect: vi.fn(),
}))

// Mock next/link for jsdom compatibility
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

import { notFound } from 'next/navigation'
const mockNotFound = vi.mocked(notFound)

// ---------------------------------------------------------------------------
// Shared fixture helpers
// ---------------------------------------------------------------------------

const VALID_TOKEN = 'tok_abc123'

function makeProject(overrides: Record<string, unknown> = {}) {
  return {
    id: 'proj_1',
    title: 'Don Quixote',
    sourceLanguage: 'Spanish',
    targetLanguage: 'English',
    status: 'COMPLETED',
    chapters: [
      { id: 'ch_1', chapterIndex: 1, startPage: 1, endPage: 24 },
      { id: 'ch_2', chapterIndex: 2, startPage: 25, endPage: 48 },
    ],
    ...overrides,
  }
}

function mockFetchSuccess(project = makeProject()) {
  vi.mocked(global.fetch).mockResolvedValueOnce(
    new Response(
      JSON.stringify({ data: project }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  )
}

function mockFetchNotFound() {
  vi.mocked(global.fetch).mockResolvedValueOnce(
    new Response(
      JSON.stringify({ error: 'Invalid token' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    )
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = vi.fn()
})

// ---------------------------------------------------------------------------
// Test 1 — Happy path: renders project title and chapter list
// ---------------------------------------------------------------------------
describe('test_read_page_fetches_project_by_token_and_renders_title', () => {
  it('renders the project title and chapter list when the token resolves to a published project', async () => {
    const project = makeProject()
    mockFetchSuccess(project)

    // Dynamic import after mocks are set so vi.resetModules() isolation works
    const { default: ReadPage } = await import('@/app/read/[token]/page')
    const jsx = await ReadPage({ params: Promise.resolve({ token: VALID_TOKEN }) })
    render(jsx as React.ReactElement)

    // Project title must be visible
    expect(screen.getByText('Don Quixote')).toBeInTheDocument()

    // Both chapters must appear (by chapter index or heading)
    expect(screen.getByText(/chapter\s+1/i)).toBeInTheDocument()
    expect(screen.getByText(/chapter\s+2/i)).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Test 2 — 404 on unknown token: calls notFound()
// ---------------------------------------------------------------------------
describe('test_read_page_renders_404_on_unknown_token', () => {
  it('calls notFound() when the API returns 404 — does not leak project existence info', async () => {
    mockFetchNotFound()

    // Make notFound a no-op so the component can reach the assertion
    mockNotFound.mockImplementation(() => {
      // Intentionally does not throw — lets us assert it was called
      return undefined as never
    })

    const { default: ReadPage } = await import('@/app/read/[token]/page')

    // The page may return null/undefined after calling notFound; that's fine
    try {
      const jsx = await ReadPage({ params: Promise.resolve({ token: 'tok_unknown' }) })
      if (jsx) render(jsx as React.ReactElement)
    } catch {
      // notFound() implementations may throw — that's also acceptable
    }

    expect(mockNotFound).toHaveBeenCalledTimes(1)

    // Must NOT reveal project-specific content (404 is ambiguous by design)
    expect(screen.queryByText(/don quixote/i)).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Test 3 — Reader page must not expose any owner-only controls
// ---------------------------------------------------------------------------
describe('test_read_page_does_not_show_owner_controls', () => {
  it('renders no Start Translating, Delete, or glossary-edit controls even when the project is found', async () => {
    mockFetchSuccess()

    const { default: ReadPage } = await import('@/app/read/[token]/page')
    const jsx = await ReadPage({ params: Promise.resolve({ token: VALID_TOKEN }) })
    render(jsx as React.ReactElement)

    // None of these owner-only controls must be present
    expect(screen.queryByText(/start translating/i)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /delete/i })
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/edit glossary/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/add term/i)).not.toBeInTheDocument()
  })
})
