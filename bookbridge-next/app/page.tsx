import Link from 'next/link'
import { auth } from '@clerk/nextjs/server'
import { UserButton } from '@clerk/nextjs'

export default async function Home() {
  const { userId } = await auth()
  return (
    <div className="flex min-h-screen flex-col bg-cream">
      <header className="border-b border-parchment">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-white font-serif text-lg font-bold">
              B
            </div>
            <span className="font-serif text-xl font-bold text-ink">
              BookBridge
            </span>
          </div>
          <div className="flex items-center gap-4">
            {userId ? (
              <>
                <Link
                  href="/dashboard"
                  className="text-sm font-medium text-ink-light hover:text-ink"
                >
                  My Library
                </Link>
                <UserButton />
              </>
            ) : (
              <>
                <Link
                  href="/sign-in"
                  className="text-sm font-medium text-ink-light hover:text-ink"
                >
                  Sign In
                </Link>
                <Link
                  href="/sign-up"
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors"
                >
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-6 pt-20 pb-16">
          <div className="grid items-center gap-16 lg:grid-cols-2">
            <div>
              <p className="text-sm font-medium uppercase tracking-widest text-accent">
                AI-Powered Translation
              </p>
              <h1 className="mt-4 font-serif text-5xl font-bold leading-tight text-ink sm:text-6xl">
                Read any book
                <br />
                in your language
              </h1>
              <p className="mt-6 text-lg leading-relaxed text-ink-light">
                Upload a book, translate it chapter by chapter with AI, and read
                in an immersive bilingual view. Smart glossary keeps names and
                terms consistent across the entire story.
              </p>
              <div className="mt-10 flex items-center gap-4">
                <Link
                  href={userId ? '/dashboard' : '/sign-up'}
                  className="rounded-lg bg-accent px-7 py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-accent-hover transition-colors"
                >
                  {userId ? 'Go to Dashboard' : 'Start Translating'}
                </Link>
                <Link
                  href="/read/demo"
                  className="rounded-lg border border-spine/30 bg-white px-7 py-3.5 text-sm font-semibold text-ink hover:bg-paper transition-colors"
                >
                  View Demo
                </Link>
              </div>
            </div>

            <div className="relative hidden lg:block">
              <div className="rounded-2xl border border-parchment bg-white p-8 shadow-xl shadow-parchment/50">
                <div className="flex items-center gap-3 border-b border-parchment pb-4">
                  <div className="h-3 w-3 rounded-full bg-accent/30" />
                  <div className="h-3 w-3 rounded-full bg-highlight" />
                  <div className="h-3 w-3 rounded-full bg-parchment" />
                  <span className="ml-2 text-xs text-ink-muted">The Little Prince — Chapter 1</span>
                </div>
                <div className="mt-6 grid grid-cols-2 gap-6">
                  <div>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                      English
                    </p>
                    <p className="font-serif text-sm leading-relaxed text-ink">
                      Once when I was six years old I saw a magnificent picture
                      in a book, called True Stories from Nature, about the
                      primeval forest.
                    </p>
                  </div>
                  <div className="rounded-lg bg-accent-light/50 p-3">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-accent">
                      中文翻译
                    </p>
                    <p className="font-serif text-sm leading-relaxed text-ink">
                      当我六岁的时候，在一本描写原始森林的名叫《真实的故事》的书中，
                      看到了一幅精彩的插画。
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <span className="rounded-full bg-highlight/50 px-2.5 py-1 text-[10px] font-medium text-ink-light">
                    primeval forest → 原始森林
                  </span>
                  <span className="rounded-full bg-highlight/50 px-2.5 py-1 text-[10px] font-medium text-ink-light">
                    True Stories → 真实的故事
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-parchment bg-paper/50">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <p className="text-center text-sm font-medium uppercase tracking-widest text-accent">
              How It Works
            </p>
            <h2 className="mt-3 text-center font-serif text-3xl font-bold text-ink">
              Three steps to your translated book
            </h2>
            <div className="mt-14 grid gap-8 md:grid-cols-3">
              <div className="text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-light text-2xl">
                  📄
                </div>
                <h3 className="mt-5 font-serif text-lg font-semibold text-ink">
                  Upload
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-light">
                  Upload your PDF book. We parse it into chapters automatically
                  and build a table of contents.
                </p>
              </div>
              <div className="text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-light text-2xl">
                  🌐
                </div>
                <h3 className="mt-5 font-serif text-lg font-semibold text-ink">
                  Translate
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-light">
                  Translate chapter by chapter with AI. A project glossary keeps
                  character names and terms consistent.
                </p>
              </div>
              <div className="text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-light text-2xl">
                  📖
                </div>
                <h3 className="mt-5 font-serif text-lg font-semibold text-ink">
                  Read
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-light">
                  Read in our bilingual reader — original and translation side
                  by side, like a real book.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-parchment bg-cream py-8 text-center text-sm text-ink-muted">
        BookBridge &mdash; AI-Powered Book Translation
      </footer>
    </div>
  )
}
