import Link from 'next/link'

export default function PublicReadNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-cream p-6 text-center">
      <h1 className="font-serif text-3xl font-bold text-ink">
        This link is no longer available
      </h1>
      <p className="mt-3 max-w-md text-sm text-ink-muted">
        The page you were looking for can&apos;t be found. The owner may have
        unpublished it or rotated the link.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
      >
        Go to BookBridge
      </Link>
    </div>
  )
}
