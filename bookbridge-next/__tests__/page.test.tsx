import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// Must be hoisted before any imports that transitively touch @clerk/nextjs/server
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}))

// Mock the UserButton client component and AuthNav — cannot render in jsdom
vi.mock('@clerk/nextjs', () => ({
  UserButton: () => <div data-testid="user-button" />,
}))

vi.mock('@/app/components/AuthNav', () => ({
  default: () => <div data-testid="user-button" />,
}))

// TODO: reserved for tests that assert redirect() on protected routes
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

let mockAuth: ReturnType<typeof vi.mocked<typeof auth>>

describe('app/page.tsx — auth-aware landing page', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    const { auth: freshAuth } = await import('@clerk/nextjs/server')
    mockAuth = vi.mocked(freshAuth)
  })

  it('returns 200 and shows Sign In and Get Started links when signed out', async () => {
    mockAuth.mockResolvedValueOnce(
      { userId: null } as Awaited<ReturnType<typeof auth>>
    )
    const { default: Home } = await import('@/app/page')
    const jsx = await Home()
    render(jsx as React.ReactElement)

    // auth() must be called so the page is conditionally rendered
    expect(mockAuth).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Sign In')).toBeInTheDocument()
    expect(screen.getByText('Get Started')).toBeInTheDocument()
  })

  it('does not show Sign In or Get Started links when signed in', async () => {
    mockAuth.mockResolvedValueOnce(
      { userId: 'user_abc' } as Awaited<ReturnType<typeof auth>>
    )
    const { default: Home } = await import('@/app/page')
    const jsx = await Home()
    render(jsx as React.ReactElement)

    expect(screen.queryByText('Sign In')).not.toBeInTheDocument()
    expect(screen.queryByText('Get Started')).not.toBeInTheDocument()
    const myLib = screen.getByRole('link', { name: /my library/i })
    expect(myLib).toHaveAttribute('href', '/dashboard')
    expect(screen.getByTestId('user-button')).toBeInTheDocument()
  })

  it('has Start Translating link pointing to /sign-up when signed out', async () => {
    mockAuth.mockResolvedValueOnce(
      { userId: null } as Awaited<ReturnType<typeof auth>>
    )
    const { default: Home } = await import('@/app/page')
    const jsx = await Home()
    render(jsx as React.ReactElement)

    // auth() must be called so the CTA href is conditionally chosen
    expect(mockAuth).toHaveBeenCalledTimes(1)
    const cta = screen.getByRole('link', { name: /start translating/i })
    expect(cta).toHaveAttribute('href', '/sign-up')
  })

  it('has Go to Dashboard link pointing to /dashboard when signed in', async () => {
    mockAuth.mockResolvedValueOnce(
      { userId: 'user_abc' } as Awaited<ReturnType<typeof auth>>
    )
    const { default: Home } = await import('@/app/page')
    const jsx = await Home()
    render(jsx as React.ReactElement)

    const cta = screen.getByRole('link', { name: /go to dashboard/i })
    expect(cta).toHaveAttribute('href', '/dashboard')
  })
})
