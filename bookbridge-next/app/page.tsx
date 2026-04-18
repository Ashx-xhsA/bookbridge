import Link from 'next/link'
import { BookOpen, Globe, Sparkles, ArrowRight } from 'lucide-react'

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2 text-lg font-bold">
            <BookOpen className="h-6 w-6 text-blue-600" />
            BookBridge
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/sign-in"
              className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Sign In
            </Link>
            <Link
              href="/sign-up"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-5xl font-bold tracking-tight sm:text-6xl">
            Translate books with
            <span className="text-blue-600"> AI precision</span>
          </h1>
          <p className="mt-6 text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            Upload a PDF, select chapters to translate, and read the results in
            an immersive bilingual view. Terminology stays consistent across the
            entire book via a project-scoped glossary.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Link
              href="/sign-up"
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              Start Translating
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/read/demo"
              className="rounded-lg border border-zinc-300 px-6 py-3 text-sm font-semibold shadow-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              View Demo
            </Link>
          </div>
        </div>

        <div className="mx-auto mt-24 grid max-w-5xl gap-8 md:grid-cols-3">
          <div className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
            <Globe className="mb-4 h-8 w-8 text-blue-600" />
            <h3 className="text-lg font-semibold">Multi-Language</h3>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Translate to Chinese, Spanish, Arabic, and more. Each language has
              dedicated quality checks.
            </p>
          </div>
          <div className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
            <BookOpen className="mb-4 h-8 w-8 text-blue-600" />
            <h3 className="text-lg font-semibold">Glossary Consistency</h3>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              AI-managed glossary ensures character names and terminology stay
              consistent across all chapters.
            </p>
          </div>
          <div className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
            <Sparkles className="mb-4 h-8 w-8 text-blue-600" />
            <h3 className="text-lg font-semibold">Chapter-by-Chapter</h3>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Translate selectively. Start reading immediately — no need to wait
              for the entire book.
            </p>
          </div>
        </div>
      </main>

      <footer className="border-t border-zinc-200 py-8 text-center text-sm text-zinc-500 dark:border-zinc-800">
        BookBridge &mdash; AI-Powered Book Translation Platform
      </footer>
    </div>
  )
}
