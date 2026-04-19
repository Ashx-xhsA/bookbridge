/**
 * Failing (red) tests for issue #51 — surface 3:
 * app/read/[id]/page.tsx access gate.
 *
 * Current behavior:
 *   - auth() is NEVER called (no authentication check)
 *   - Queries with `where: { id, isPublic: true }` — only public projects load
 *
 * Required behavior after issue #51:
 *   - auth() called first; unauthenticated → redirect('/sign-in')
 *   - Owner (ownerId === userId) → renders even if isPublic === false
 *   - Non-owner + isPublic === true → renders
 *   - Non-owner + non-public → notFound() (404, not 403, to avoid leaking existence)
 *
 * Why each test fails against the current implementation:
 *   1. Auth guard: page never calls auth() → mockRedirect is never called
 *   2. Owner access: page never calls auth() → cannot know if viewer is owner
 *   3. Public non-owner: page never calls auth(), so the assertion `auth was called` fails
 *   4. Non-owner + non-public: page renders it (because mock bypasses isPublic filter) instead of notFound()
 *   5. Edge case: project not found → already works correctly (notFound() called)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Must be hoisted before any imports that touch @clerk/nextjs/server
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkMiddleware: vi.fn(() => vi.fn()),
  createRouteMatcher: vi.fn(() => vi.fn()),
}))

const mockRedirect = vi.fn((_url: string) => { throw new Error('NEXT_REDIRECT') })
const mockNotFound = vi.fn(() => { throw new Error('NEXT_NOT_FOUND') })
vi.mock('next/navigation', () => ({
  redirect: (url: string) => mockRedirect(url),
  notFound: () => mockNotFound(),
}))

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

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
const OTHER_USER_ID = 'user_other'
const PROJECT_ID = 'clh3p7b1p0001qzrmkf8g4m0i'

const publicProject = {
  id: PROJECT_ID,
  title: 'A Public Book',
  ownerId: OWNER_ID,
  isPublic: true,
  sourceLang: 'en',
  targetLang: 'zh-Hans',
  chapters: [],
}

const privateProject = {
  id: PROJECT_ID,
  title: 'A Private Book',
  ownerId: OWNER_ID,
  isPublic: false,
  sourceLang: 'en',
  targetLang: 'zh-Hans',
  chapters: [],
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('app/read/[id]/page.tsx — access gate (issue #51)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    // clearAllMocks does NOT drain the mockResolvedValueOnce queue; reset
    // per-test fakes explicitly so earlier tests' unused fixtures don't leak
    // (e.g. the unauth test sets a prisma fixture that redirect() bypasses).
    vi.mocked(auth).mockReset()
    mockProjectFindUnique.mockReset()
  })

  // -------------------------------------------------------------------------
  // Auth guard — unauthenticated → redirect to /sign-in (OWASP A07)
  // Current page never calls auth(), so mockRedirect is never invoked.
  // -------------------------------------------------------------------------
  it('redirects unauthenticated users to /sign-in', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: null } as AuthReturn)
    // DB returns nothing (user is not authenticated, should never reach DB)
    mockProjectFindUnique.mockResolvedValueOnce(null)

    const { default: ReaderPage } = await import('@/app/read/[id]/page')

    try {
      await ReaderPage(makeParams(PROJECT_ID))
    } catch {
      // Expect redirect to throw; notFound would also throw — we differentiate below
    }

    // THE FAILING ASSERTION: current page never calls auth() so redirect is never called.
    expect(mockRedirect).toHaveBeenCalledWith('/sign-in')
  })

  // -------------------------------------------------------------------------
  // Owner access — renders even if isPublic === false
  // Current page never calls auth() → cannot detect owner → only isPublic works.
  // -------------------------------------------------------------------------
  it('renders the page for the project owner regardless of isPublic flag', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: OWNER_ID } as AuthReturn)
    // Prisma mock returns the private project (owner is authenticated)
    mockProjectFindUnique.mockResolvedValueOnce(privateProject)

    const { default: ReaderPage } = await import('@/app/read/[id]/page')

    // THE FAILING ASSERTION: current page never calls auth(), so it cannot
    // verify ownership. It queries `where: {id, isPublic: true}` and if the
    // mock bypasses the filter it renders — but auth() still was never called.
    // The implementation MUST call auth() to make this work correctly.
    // We test that auth() was actually invoked as proof the ownership path runs.
    await ReaderPage(makeParams(PROJECT_ID)).catch(() => {
      // Catch any notFound/redirect errors — they indicate the page blocked access
      throw new Error('Owner was blocked — access gate is too restrictive')
    })

    // auth() must have been called as part of the ownership decision
    expect(vi.mocked(auth)).toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Public non-owner access → renders; auth() must still be called first
  // -------------------------------------------------------------------------
  it('renders the page for a non-owner when the project is public', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: OTHER_USER_ID } as AuthReturn)
    mockProjectFindUnique.mockResolvedValueOnce(publicProject)

    const { default: ReaderPage } = await import('@/app/read/[id]/page')

    await ReaderPage(makeParams(PROJECT_ID)).catch((e: Error) => {
      throw new Error(`Public project access threw unexpectedly: ${e.message}`)
    })

    // THE FAILING ASSERTION: current page never calls auth().
    expect(vi.mocked(auth)).toHaveBeenCalled()
    expect(mockNotFound).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Non-owner + non-public → notFound() (not 403, to avoid IDOR leaking)
  // The mock bypasses the isPublic filter and returns the private project,
  // so the current page renders it — it should call notFound() instead.
  // -------------------------------------------------------------------------
  it('calls notFound() when non-owner requests a non-public project', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: OTHER_USER_ID } as AuthReturn)
    // Return the private project regardless of where clause
    mockProjectFindUnique.mockResolvedValueOnce(privateProject)

    const { default: ReaderPage } = await import('@/app/read/[id]/page')

    let rendered = false
    try {
      await ReaderPage(makeParams(PROJECT_ID))
      rendered = true
    } catch (e) {
      if ((e as Error).message !== 'NEXT_NOT_FOUND') {
        throw e
      }
    }

    // THE FAILING ASSERTION: current page renders privateProject for any user
    // because auth() is never called and the prisma mock bypasses the isPublic filter.
    // The correct implementation must call auth(), detect non-owner, and call notFound().
    expect(rendered).toBe(false)
    expect(mockNotFound).toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Edge case: project does not exist → notFound() (auth must still be called first)
  // -------------------------------------------------------------------------
  it('calls notFound() when project does not exist in database', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: OWNER_ID } as AuthReturn)
    mockProjectFindUnique.mockResolvedValueOnce(null)

    const { default: ReaderPage } = await import('@/app/read/[id]/page')

    await expect(ReaderPage(makeParams('nonexistent-id'))).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
    // auth() must have been called before the DB query
    expect(vi.mocked(auth)).toHaveBeenCalled()
  })
})
