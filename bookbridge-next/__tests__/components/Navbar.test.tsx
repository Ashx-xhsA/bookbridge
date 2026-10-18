import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@clerk/nextjs', () => ({
  UserButton: () => <div data-testid="user-button" />,
}))

import Navbar from '@/app/components/Navbar'

describe('Navbar', () => {
  it('links to the library, settings and About', () => {
    render(<Navbar />)
    expect(screen.getByRole('link', { name: /my library/i })).toHaveAttribute('href', '/dashboard')
    expect(screen.getByRole('link', { name: /settings/i })).toHaveAttribute('href', '/dashboard/settings')
    expect(screen.getByRole('link', { name: /about/i })).toHaveAttribute('href', '/about')
  })
})
