/**
 * Failing (red) tests for issue #51 — surface 4:
 * app/dashboard/projects/[id]/page.tsx — Start Reading button.
 *
 * The current page shows a "View Published" link only when isPublic === true.
 * Issue #51 requires:
 *   - Project with chapters.length > 0 → shows a "Start Reading" link/button
 *     pointing to /read/[id]
 *   - Project with chapters.length === 0 → "Start Reading" is NOT rendered
 *
 * Both assertions will fail against the current implementation because
 * the page renders "View Published" (not "Start Reading") and only when
 * isPublic is true.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// Must be hoisted before any imports that touch @clerk/nextjs/server
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkMiddleware: vi.fn(() => vi.fn()),
  createRouteMatcher: vi.fn(() => vi.fn()),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
}))

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

vi.mock('lucide-react', () => ({
  FileText: () => <svg data-testid="icon-file-text" />,
  BookOpen: () => <svg data-testid="icon-book-open" />,
  ArrowLeft: () => <svg data-testid="icon-arrow-left" />,
  Play: () => <svg data-testid="icon-play" />,
  Loader2: () => <svg data-testid="icon-loader" />,
  CheckCircle: () => <svg data-testid="icon-check-circle" />,
  Clock: () => <svg data-testid="icon-clock" />,
  Sparkles: () => <svg data-testid="icon-sparkles" />,
  PlayCircle: () => <svg data-testid="icon-play-circle" />,
}))

// Mock TranslateButton (client component — cannot render in jsdom)
vi.mock(
  '@/app/dashboard/projects/[id]/TranslateButton',
  () => ({
    default: ({ projectId, chapterId }: { projectId: string; chapterId: string }) => (
      <button data-testid="translate-btn" data-project={projectId} data-chapter={chapterId}>
        Translate
      </button>
    ),
  })
)

// Mock DeleteProjectButton (client component — uses useRouter which is not mocked here)
vi.mock(
  '@/app/dashboard/projects/[id]/DeleteProjectButton',
  () => ({
    default: ({ projectId }: { projectId: string }) => (
      <button data-testid="delete-project-btn" data-project={projectId}>
        Delete
      </button>
    ),
  })
)

vi.mock(
  '@/app/dashboard/projects/[id]/PublishToggle',
  () => ({
    default: ({ projectId }: { projectId: string }) => (
      <button data-testid="publish-toggle" data-project={projectId}>
        Publish
      </button>
    ),
  })
)

vi.mock(
  '@/app/dashboard/projects/[id]/ChapterExplorer',
  () => ({
    default: ({ chapters }: { chapters: { id: string }[] }) => (
      <div data-testid="chapter-explorer">{chapters.length} chapters loaded</div>
    ),
  })
)

const mockProjectFindUnique = vi.fn()

vi.mock('@/lib/prisma', () => ({
  default: {
    project: {
      findUnique: (...args: unknown[]) => mockProjectFindUnique(...args),
    },
  },
}))

import { auth } from '@clerk/nextjs/server'

type AuthReturn = Awaited<ReturnType<typeof auth>>

const OWNER_ID = 'user_owner'
const PROJECT_ID = 'clh3p7b1p0001qzrmkf8g4m0i'

const projectWithChapters = {
  id: PROJECT_ID,
  title: 'My Novel',
  ownerId: OWNER_ID,
  isPublic: false,
  sourceLang: 'en',
  targetLang: 'zh-Hans',
  status: 'READY',
  createdAt: new Date(),
  updatedAt: new Date(),
  chapters: [
    {
      id: 'ch1',
      number: 1,
      title: 'Chapter One',
      startPage: 1,
      endPage: 10,
      pageCount: 10,
      sourceContent: 'Some text.',
      translation: null,
      summary: null,
    },
  ],
  jobs: [],
  glossary: [],
}

const projectWithoutChapters = {
  ...projectWithChapters,
  chapters: [],
  status: 'DRAFT',
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('app/dashboard/projects/[id]/page.tsx — Start Reading button (issue #51)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  // -------------------------------------------------------------------------
  // Happy path: project has chapters → Start Reading link is rendered
  // -------------------------------------------------------------------------
  it('renders a Start Reading link pointing to /read/[id] when chapters exist', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: OWNER_ID } as AuthReturn)
    mockProjectFindUnique.mockResolvedValueOnce(projectWithChapters)

    const { default: ProjectPage } = await import(
      '@/app/dashboard/projects/[id]/page'
    )
    const jsx = await ProjectPage(makeParams(PROJECT_ID))
    render(jsx as React.ReactElement)

    // THE FAILING ASSERTION: current page renders "View Published" (not "Start Reading")
    // and only when isPublic === true.  For a private project with chapters the
    // Start Reading button must appear.
    const link = screen.getByRole('link', { name: /start reading/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', `/read/${PROJECT_ID}`)
  })

  // -------------------------------------------------------------------------
  // Edge case: project has no chapters → Start Reading is NOT rendered
  // -------------------------------------------------------------------------
  it('does NOT render Start Reading when the project has no chapters', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: OWNER_ID } as AuthReturn)
    mockProjectFindUnique.mockResolvedValueOnce(projectWithoutChapters)

    const { default: ProjectPage } = await import(
      '@/app/dashboard/projects/[id]/page'
    )
    const jsx = await ProjectPage(makeParams(PROJECT_ID))
    render(jsx as React.ReactElement)

    // THE FAILING ASSERTION: if the button were unconditionally rendered,
    // this would find it and fail. The implementation must hide it for empty projects.
    expect(screen.queryByRole('link', { name: /start reading/i })).not.toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // Auth guard (OWASP A07) — unauthenticated → redirect
  // -------------------------------------------------------------------------
  it('redirects unauthenticated users before rendering', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: null } as AuthReturn)

    const { redirect } = await import('next/navigation')
    const { default: ProjectPage } = await import(
      '@/app/dashboard/projects/[id]/page'
    )

    // The page already calls redirect('/sign-in') for unauthenticated users,
    // so this test confirms the existing guard is not regressed.
    try {
      await ProjectPage(makeParams(PROJECT_ID))
    } catch {
      // redirect() in tests throws — that is expected
    }
    expect(vi.mocked(redirect)).toHaveBeenCalledWith('/sign-in')
  })

  // -------------------------------------------------------------------------
  // Ownership check (OWASP A01 / IDOR)
  // -------------------------------------------------------------------------
  it('calls notFound() when the authenticated user does not own the project', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: 'user_intruder' } as AuthReturn)
    mockProjectFindUnique.mockResolvedValueOnce({
      ...projectWithChapters,
      ownerId: OWNER_ID, // different from user_intruder
    })

    const { default: ProjectPage } = await import(
      '@/app/dashboard/projects/[id]/page'
    )

    // The page already calls notFound() for non-owners — confirm not regressed.
    await expect(ProjectPage(makeParams(PROJECT_ID))).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
