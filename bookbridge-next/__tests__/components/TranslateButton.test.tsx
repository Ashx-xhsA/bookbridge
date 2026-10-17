/**
 * The Translate button must not move while it runs: the "do not leave" note
 * appears below it without adding height to its row (the row is vertically
 * centred, so extra height pushed the button up), and the running label
 * stays on one line.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('@/lib/jobPoll', () => ({ pollJob: () => new Promise(() => {}) }))
vi.stubGlobal(
  'fetch',
  vi.fn(() => Promise.resolve({ ok: true, status: 202, json: () => Promise.resolve({ id: 'job1' }) }))
)

import TranslateButton from '@/app/dashboard/projects/[id]/TranslateButton'

describe('TranslateButton while translating', () => {
  it('keeps the button in place: the note sits below it out of the layout flow', async () => {
    const { container } = render(<TranslateButton projectId="p1" chapterId="c1" />)
    fireEvent.click(screen.getByRole('button', { name: /translate/i }))

    const note = await screen.findByText(/do not leave this page/i)
    expect(note.className).toMatch(/\babsolute\b/)
    expect(note.className).toMatch(/\btop-full\b/)
    expect((container.firstChild as HTMLElement).className).toMatch(/\brelative\b/)
  })

  it('keeps the running label on one line with steady-width digits', async () => {
    render(<TranslateButton projectId="p1" chapterId="c1" />)
    fireEvent.click(screen.getByRole('button', { name: /translate/i }))

    const button = await screen.findByRole('button', { name: /translating/i })
    expect(button.className).toMatch(/\bwhitespace-nowrap\b/)
    expect(button.className).toMatch(/\btabular-nums\b/)
  })
})
