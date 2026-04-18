'use client'

import Link from 'next/link'
import { UserButton } from '@clerk/nextjs'
import { BookOpen } from 'lucide-react'

export default function Navbar() {
  return (
    <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/dashboard" className="flex items-center gap-2 text-lg font-bold">
          <BookOpen className="h-6 w-6 text-blue-600" />
          BookBridge
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400"
          >
            Dashboard
          </Link>
          <UserButton />
        </div>
      </div>
    </header>
  )
}
