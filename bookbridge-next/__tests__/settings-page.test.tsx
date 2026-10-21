import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SettingsPage from '@/app/dashboard/settings/page'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }))
}

describe('Settings page', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockFetch.mockImplementationOnce(() =>
      json({ apiProvider: 'custom', apiBaseUrl: 'https://api.example.com/v1', hasApiKey: true })
    )
  })

  it('tells the user their API key is encrypted at rest', async () => {
    render(<SettingsPage />)
    expect(await screen.findByText(/encrypted with AES-256-GCM/i)).toBeInTheDocument()
  })

  it('shows why a base URL was rejected', async () => {
    render(<SettingsPage />)
    await screen.findByText(/encrypted with AES-256-GCM/i)
    mockFetch.mockImplementationOnce(() =>
      json({ error: 'Base URL must be a public https:// address' }, 400)
    )
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }))
    expect(await screen.findByText('Base URL must be a public https:// address')).toBeInTheDocument()
  })
})
