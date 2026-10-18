/**
 * <ReviewToggle> — the per-project switch for the review pass. Off by default:
 * the Phase 6 eval found it costs about 4x the tokens of plain translation
 * with no gain in name consistency, so users opt in.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import ReviewToggle from '@/app/dashboard/projects/[id]/ReviewToggle'

const PROJECT_ID = 'clh3p7b1p0001qzrmkf8g4m0i'

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = vi.fn()
})

describe('ReviewToggle', () => {
  it('shows the saved state', () => {
    render(<ReviewToggle projectId={PROJECT_ID} initialEnabled={false} />)
    expect(screen.getByRole('checkbox', { name: /double-check translations/i })).not.toBeChecked()
  })

  it('saves the new state to the project', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { reviewEnabled: true } }), { status: 200 })
    )
    render(<ReviewToggle projectId={PROJECT_ID} initialEnabled={false} />)

    fireEvent.click(screen.getByRole('checkbox', { name: /double-check translations/i }))

    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: /double-check translations/i })).toBeChecked()
    )
    expect(global.fetch).toHaveBeenCalledWith(`/api/projects/${PROJECT_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewEnabled: true }),
    })
  })

  it('goes back to the saved state and says so when saving fails', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(new Response('{}', { status: 500 }))
    render(<ReviewToggle projectId={PROJECT_ID} initialEnabled={true} />)

    fireEvent.click(screen.getByRole('checkbox', { name: /double-check translations/i }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /double-check translations/i })).toBeChecked()
  })
})
