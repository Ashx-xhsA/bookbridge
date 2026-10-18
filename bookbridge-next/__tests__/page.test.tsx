import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// Must be hoisted before any imports that transitively touch @clerk/nextjs/server
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}))

// Mock the UserButton client component — it cannot render in jsdom
vi.mock('@clerk/nextjs', () => ({
  UserButton: () => <div data-testid="user-button" />,
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

// Mock next/link so href is accessible in jsdom
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
const mockAuth = vi.mocked(auth)
type AuthReturn = Awaited<ReturnType<typeof auth>>

async function renderPage(path: '@/app/page' | '@/app/about/page', userId: string | null) {
  mockAuth.mockResolvedValueOnce({ userId } as AuthReturn)
  const { default: Page } = await import(path)
  const jsx = await Page()
  if (jsx) render(jsx as React.ReactElement)
}

describe('app/page.tsx — the About page is the homepage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('shows signed-out visitors what BookBridge does, with sign-in and get-started links', async () => {
    await renderPage('@/app/page', null)

    expect(redirect).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: /what it does differently/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /some ways to use it/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /before you start/i })).toBeInTheDocument()
    expect(screen.getByText(/your own API key/i)).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /get started/i })[0]).toHaveAttribute('href', '/sign-up')
    expect(screen.getAllByRole('link', { name: /sign in/i })[0]).toHaveAttribute('href', '/sign-in')
  })

  it('has no demo any more', async () => {
    await renderPage('@/app/page', null)
    expect(screen.queryByText(/view demo/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/little prince/i)).not.toBeInTheDocument()
  })

  it('shows the sample book: a screenshot, a link to read it, and where it comes from', async () => {
    await renderPage('@/app/page', null)
    expect(screen.getByRole('img', { name: /bilingual reader/i })).toHaveAttribute(
      'src',
      expect.stringContaining('/screenshots/reader.webp')
    )
    expect(screen.getByRole('link', { name: /read a sample/i })).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/read\/[0-9a-f-]{36}#ch-\d+$/)
    )
    expect(screen.getByText(/Wuthering Heights/)).toHaveTextContent(/Project Gutenberg/)
  })

  it('sends signed-in users straight to their library', async () => {
    await renderPage('@/app/page', 'user_abc')
    expect(redirect).toHaveBeenCalledWith('/dashboard')
  })
})

describe('app/about/page.tsx — About stays reachable when signed in', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('shows the same content with a link back to the library', async () => {
    await renderPage('@/app/about/page', 'user_abc')

    expect(redirect).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: /what it does differently/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^my library$/i })).toHaveAttribute('href', '/dashboard')
    expect(screen.getByTestId('user-button')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /sign in/i })).not.toBeInTheDocument()
  })

  it('works signed out too', async () => {
    await renderPage('@/app/about/page', null)
    expect(screen.getByRole('heading', { name: /what it does differently/i })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /sign in/i })[0]).toHaveAttribute('href', '/sign-in')
  })
})
