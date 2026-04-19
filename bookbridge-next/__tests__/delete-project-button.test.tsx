/**
 * Failing (red) tests for the DeleteProjectButton UI wiring.
 *
 * Context: PR #55 (issue #29) shipped DELETE /api/projects/[id]. The library
 * and project-detail pages still have no way to invoke it. This component
 * adds a two-step inline confirm ("Delete" → "Cancel | Confirm delete") and
 * calls the endpoint, then redirects to /dashboard on success.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: mockPush, refresh: vi.fn() })),
}))

vi.mock('lucide-react', () => ({
  Trash2: () => <svg data-testid="trash-icon" />,
  Loader2: () => <svg data-testid="loader-icon" />,
}))

import DeleteProjectButton from '@/app/dashboard/projects/[id]/DeleteProjectButton'

const PROJECT_ID = 'clh3p7b1p0001qzrmkf8g4m0i'

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = vi.fn()
})

describe('DeleteProjectButton — initial state', () => {
  it('renders a single Delete button by default (no confirmation visible yet)', () => {
    render(<DeleteProjectButton projectId={PROJECT_ID} />)
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /confirm delete/i })).not.toBeInTheDocument()
  })

  it('does not call fetch on initial render', () => {
    render(<DeleteProjectButton projectId={PROJECT_ID} />)
    expect(global.fetch).not.toHaveBeenCalled()
  })
})

describe('DeleteProjectButton — confirm flow', () => {
  it('clicking Delete reveals Cancel and Confirm delete buttons', () => {
    render(<DeleteProjectButton projectId={PROJECT_ID} />)
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    expect(screen.getByRole('button', { name: /^cancel$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /confirm delete/i })).toBeInTheDocument()
  })

  it('Cancel returns to initial state and does not call fetch', () => {
    render(<DeleteProjectButton projectId={PROJECT_ID} />)
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /confirm delete/i })).not.toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalled()
  })
})

describe('DeleteProjectButton — API call', () => {
  it('Confirm delete sends DELETE to /api/projects/[id]', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(null, { status: 204 }),
    )
    render(<DeleteProjectButton projectId={PROJECT_ID} />)
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm delete/i }))
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/projects/${PROJECT_ID}`,
        expect.objectContaining({ method: 'DELETE' }),
      )
    })
  })

  it('on 204 success, redirects to /dashboard', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(null, { status: 204 }),
    )
    render(<DeleteProjectButton projectId={PROJECT_ID} />)
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm delete/i }))
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/dashboard')
    })
  })
})

describe('DeleteProjectButton — error handling', () => {
  it('shows an error message and stays on the page on 403', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }),
    )
    render(<DeleteProjectButton projectId={PROJECT_ID} />)
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm delete/i }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('shows an error message on 404', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Not found' }), { status: 404 }),
    )
    render(<DeleteProjectButton projectId={PROJECT_ID} />)
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm delete/i }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('shows an error message when fetch rejects (network error)', async () => {
    vi.mocked(global.fetch).mockRejectedValueOnce(new Error('network down'))
    render(<DeleteProjectButton projectId={PROJECT_ID} />)
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm delete/i }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(mockPush).not.toHaveBeenCalled()
  })
})
