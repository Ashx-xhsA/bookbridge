/**
 * Tests for issue #57 — public reader page at /read/[token].
 *
 * Routing: Next 16 disallows sibling dynamic routes with different slug names,
 * so /read/[id] handles both owner URLs (/read/<cuid>) and public URLs
 * (/read/<uuid>). The public branch is picked by UUID format — no auth, no
 * owner check, 404 on unknown/unpublished token.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// Hoisted mocks — must come before any import that transitively pulls these.
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkMiddleware: vi.fn(() => vi.fn()),
  createRouteMatcher: vi.fn(() => vi.fn()),
}))

vi.mock('next/navigation', () => ({
  notFound: vi.fn(),
  redirect: vi.fn(),
}))

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

// The page imports prisma + the public-project helper; mock both so no real
// DB call can happen in jsdom.
vi.mock('@/lib/prisma', () => ({
  default: { project: { findUnique: vi.fn() } },
}))

vi.mock('@/app/read/[id]/ReaderView', () => ({
  default: ({ title, chapters }: { title: string; chapters: { number: number; title: string }[] }) => (
    <div>
      <h1>{title}</h1>
      {chapters.map((ch) => (
        <div key={ch.number}>Chapter {ch.number}: {ch.title}</div>
      ))}
    </div>
  ),
}))

const mockGetPublished = vi.fn()
// Use importOriginal so the real `tokenSchema` (z.string().uuid()) is
// exposed — the page now dispatches on it, so stubbing it out would break
// the UUID branch entirely. We only replace the DB-touching helper.
vi.mock('@/lib/public-project', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/public-project')>()
  return {
    ...actual,
    getPublishedProjectWithChapters: vi.fn(),
    getPublishedProjectForReader: (token: string) => mockGetPublished(token),
  }
})

import { notFound } from 'next/navigation'
const mockNotFound = vi.mocked(notFound)

const VALID_TOKEN = '550e8400-e29b-41d4-a716-446655440000'

function makeProject(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Don Quixote',
    sourceLang: 'Spanish',
    targetLang: 'English',
    chapters: [
      { key: 'ch_1', id: 'ch_1', number: 1, title: 'The Windmills', done: true },
      { key: 'ch_2', id: 'ch_2', number: 2, title: 'Sancho Panza', done: false },
    ],
    initialRows: {
      ch_1: [{ index: 0, source: 'In a village of La Mancha...', translation: 'En un lugar de la Mancha...' }],
    },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
})

// ---------------------------------------------------------------------------
// Test 1 — Happy path: renders project title and chapter list
// ---------------------------------------------------------------------------
describe('test_read_page_fetches_project_by_token_and_renders_title', () => {
  it('renders the project title and chapter list when the token resolves to a published project', async () => {
    mockGetPublished.mockResolvedValueOnce(makeProject())

    const { default: ReadPage } = await import('@/app/read/[id]/page')
    const jsx = await ReadPage({ params: Promise.resolve({ id: VALID_TOKEN }) })
    render(jsx as React.ReactElement)

    expect(mockGetPublished).toHaveBeenCalledWith(VALID_TOKEN)
    // Title appears in both the sticky header and the <h1>; assert on the <h1>
    // so the test pins the main reader heading, not any incidental chrome.
    expect(
      screen.getByRole('heading', { level: 1, name: 'Don Quixote' })
    ).toBeInTheDocument()
    expect(screen.getByText(/chapter\s+1/i)).toBeInTheDocument()
    expect(screen.getByText(/chapter\s+2/i)).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Test 2 — 404 on unknown token: calls notFound() and does not leak existence
// ---------------------------------------------------------------------------
describe('test_read_page_renders_404_on_unknown_token', () => {
  it('calls notFound() when the helper returns null — does not leak project existence info', async () => {
    mockGetPublished.mockResolvedValueOnce(null)
    // Make notFound a no-op so the component can continue past it and we can
    // still assert on whatever (if anything) it renders.
    mockNotFound.mockImplementation(() => undefined as never)

    const { default: ReadPage } = await import('@/app/read/[id]/page')

    try {
      const jsx = await ReadPage({ params: Promise.resolve({ id: VALID_TOKEN }) })
      if (jsx) render(jsx as React.ReactElement)
    } catch {
      // notFound() may throw in some implementations — that's also acceptable.
    }

    expect(mockNotFound).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(/don quixote/i)).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Test 3 — Reader page must not expose any owner-only controls
// ---------------------------------------------------------------------------
describe('test_read_page_does_not_show_owner_controls', () => {
  it('renders no Start Translating, Delete, or glossary-edit controls even when the project is found', async () => {
    mockGetPublished.mockResolvedValueOnce(makeProject())

    const { default: ReadPage } = await import('@/app/read/[id]/page')
    const jsx = await ReadPage({ params: Promise.resolve({ id: VALID_TOKEN }) })
    render(jsx as React.ReactElement)

    expect(screen.queryByText(/start translating/i)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /delete/i })
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/edit glossary/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/add term/i)).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// The built-in demo is gone: /read/demo is an ordinary id, so signed-out
// visitors are sent to sign in like any other private project.
// ---------------------------------------------------------------------------
describe('no built-in demo', () => {
  it('treats /read/demo like any other id', async () => {
    const { auth } = await import('@clerk/nextjs/server')
    const { redirect } = await import('next/navigation')
    vi.mocked(auth).mockResolvedValueOnce({ userId: null } as Awaited<ReturnType<typeof auth>>)

    const { default: ReadPage } = await import('@/app/read/[id]/page')
    await ReadPage({ params: Promise.resolve({ id: 'demo' }) })

    expect(redirect).toHaveBeenCalledWith('/sign-in')
  })
})
