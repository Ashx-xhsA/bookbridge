'use client'

import Link from 'next/link'
import { UserButton } from '@clerk/nextjs'

export default function Navbar() {
  return (
    <header className="border-b border-parchment bg-cream">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-white font-serif text-lg font-bold">
            B
          </div>
          <span className="font-serif text-xl font-bold text-ink">
            BookBridge
          </span>
        </Link>
        <div className="flex items-center gap-5">
          <Link
            href="/dashboard"
            className="text-sm font-medium text-ink-light hover:text-ink"
          >
            My Library
          </Link>
          <UserButton />
        </div>
      </div>
    </header>
  )
}
