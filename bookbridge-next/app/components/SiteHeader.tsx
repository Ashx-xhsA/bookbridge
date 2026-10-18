import Link from 'next/link'
import { UserButton } from '@clerk/nextjs'

// Header for the public pages (home and About). The dashboard uses Navbar.
export default function SiteHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="border-b border-parchment">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent font-serif text-lg font-bold text-white">
            B
          </div>
          <span className="font-serif text-xl font-bold text-ink">BookBridge</span>
        </Link>
        <div className="flex items-center gap-4">
          {signedIn ? (
            <>
              <Link href="/dashboard" className="text-sm font-medium text-ink-light hover:text-ink">
                My Library
              </Link>
              <UserButton />
            </>
          ) : (
            <>
              <Link href="/sign-in" className="text-sm font-medium text-ink-light hover:text-ink">
                Sign in
              </Link>
              <Link
                href="/sign-up"
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
              >
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
