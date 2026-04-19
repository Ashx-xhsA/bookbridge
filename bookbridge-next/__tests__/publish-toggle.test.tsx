/**
 * Failing (red) tests for issue #57:
 * "S4-7 Publish flow UI — toggle on project page"
 *
 * Tests the <PublishToggle> client component at:
 *   app/dashboard/projects/[id]/PublishToggle.tsx
 *
 * The component does NOT exist yet — all tests must fail until it is implemented.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// navigator.clipboard is not available in jsdom — stub it globally
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: vi.fn() },
  writable: true,
  configurable: true,
})

// window.confirm is used by the Republish flow to warn about token rotation
Object.defineProperty(window, 'confirm', {
  value: vi.fn(),
  writable: true,
  configurable: true,
})

import PublishToggle from '@/app/dashboard/projects/[id]/PublishToggle'

const PROJECT_ID = 'clh3p7b1p0001qzrmkf8g4m0i'
const EXISTING_TOKEN = 'tok_abc123'

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = vi.fn()
  // Reset clipboard and confirm mocks
  vi.mocked(navigator.clipboard.writeText).mockResolvedValue(undefined)
  vi.mocked(window.confirm).mockReturnValue(true)
})

// ---------------------------------------------------------------------------
// Test 1 — Renders "Publish" button when project is not yet public
// ---------------------------------------------------------------------------
describe('test_publish_toggle_renders_publish_when_unpublished', () => {
  it('renders a Publish button when initialIsPublic is false', () => {
    render(
      <PublishToggle
        projectId={PROJECT_ID}
        initialIsPublic={false}
        initialPublicToken={null}
      />
    )

    expect(
      screen.getByRole('button', { name: /publish/i })
    ).toBeInTheDocument()

    // No public link should be visible before publishing
    expect(screen.queryByText(/\/read\//i)).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Test 2 — Clicking Publish calls PATCH and renders the returned publicToken
// ---------------------------------------------------------------------------
describe('test_publish_toggle_calls_patch_and_shows_link_on_publish', () => {
  it('calls PATCH /api/projects/[id] with isPublic:true and renders the returned token as a link', async () => {
    const returnedToken = 'tok_newly_generated'
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            id: PROJECT_ID,
            isPublic: true,
            publicToken: returnedToken,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )

    render(
      <PublishToggle
        projectId={PROJECT_ID}
        initialIsPublic={false}
        initialPublicToken={null}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /publish/i }))

    // PATCH must be issued with correct shape
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/projects/${PROJECT_ID}`,
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ isPublic: true }),
        })
      )
    })

    // The returned token must appear as a copyable link
    await waitFor(() => {
      expect(
        screen.getByText(new RegExp(`/read/${returnedToken}`, 'i'))
      ).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// Test 3 — Clicking Copy writes the full URL to the clipboard
// ---------------------------------------------------------------------------
describe('test_publish_toggle_copies_link_to_clipboard', () => {
  it('clicking the Copy button writes the full origin/read/token URL to clipboard and shows confirmation feedback', async () => {
    const token = EXISTING_TOKEN
    // Render with an already-public project (token already exists)
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: { id: PROJECT_ID, isPublic: true, publicToken: token },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )

    render(
      <PublishToggle
        projectId={PROJECT_ID}
        initialIsPublic={true}
        initialPublicToken={token}
      />
    )

    // The copy button must be visible immediately for an already-public project
    const copyButton = screen.getByRole('button', { name: /copy/i })
    expect(copyButton).toBeInTheDocument()

    fireEvent.click(copyButton)

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`/read/${token}$`))
      )
    })

    // Confirmation feedback (e.g. "Copied!" text) must appear after copying
    await waitFor(() => {
      expect(screen.getByText(/copied/i)).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// Test 4 — Clicking Republish warns before rotating the token
// ---------------------------------------------------------------------------
describe('test_republish_warns_before_rotating_token', () => {
  it('shows a confirmation dialog before issuing another PATCH to rotate the token', async () => {
    const newToken = 'tok_rotated'
    vi.mocked(window.confirm).mockReturnValueOnce(true)
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: { id: PROJECT_ID, isPublic: true, publicToken: newToken },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )

    render(
      <PublishToggle
        projectId={PROJECT_ID}
        initialIsPublic={true}
        initialPublicToken={EXISTING_TOKEN}
      />
    )

    // When already public, a "Republish" button (or equivalent) must appear
    const republishButton = screen.getByRole('button', { name: /republish/i })
    fireEvent.click(republishButton)

    // window.confirm must be called before the fetch — warn about link invalidation
    expect(window.confirm).toHaveBeenCalledTimes(1)

    // After confirmation, PATCH must be issued
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/projects/${PROJECT_ID}`,
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ isPublic: true }),
        })
      )
    })
  })

  it('does NOT call fetch when the user dismisses the confirmation dialog', async () => {
    vi.mocked(window.confirm).mockReturnValueOnce(false)

    render(
      <PublishToggle
        projectId={PROJECT_ID}
        initialIsPublic={true}
        initialPublicToken={EXISTING_TOKEN}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /republish/i }))

    expect(window.confirm).toHaveBeenCalledTimes(1)
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
