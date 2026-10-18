import Link from 'next/link'
import Image from 'next/image'
import { SAMPLE_READ_URL, SCREENSHOTS } from '@/lib/showcase'

type Item = { title: string; text: string }

const DIFFERENCES: Item[] = [
  {
    title: 'Your own translation notes.',
    text: 'Tell it how you want the book translated, like the tone, the style, or what to leave as is. Optionally, let it scan the whole book first and draft notes on the plot and characters for you.',
  },
  {
    title: 'You control the names.',
    text: 'Character and place names go into an editable list. Change a name once and every chapter follows.',
  },
  {
    title: 'Context for every paragraph.',
    text: 'Each paragraph is translated with the names that appear in it and the few paragraphs before it, so chapter 30 still knows what chapter 1 decided.',
  },
  {
    title: 'Optional double-check.',
    text: 'Turn it on per book to have a second AI pass catch mistranslations and fix them. Slower and uses more tokens.',
  },
]

const USES: Item[] = [
  { title: 'Untranslated web novels.', text: 'Read the ones nobody has translated yet.' },
  {
    title: 'Language practice.',
    text: 'Read something you actually like, original and translation side by side.',
  },
  { title: 'Just a few chapters.', text: 'No need to translate the whole book.' },
  { title: 'AO3 fics.', text: 'Download a fic as EPUB from AO3 and upload it here.' },
  { title: 'Take it with you.', text: 'Export a bilingual EPUB, or share a reading link.' },
]

function ItemList({ items }: { items: Item[] }) {
  return (
    <ul className="mt-4 space-y-3">
      {items.map((item) => (
        <li key={item.title} className="leading-relaxed text-ink-light">
          <span className="font-semibold text-ink">{item.title}</span> {item.text}
        </li>
      ))}
    </ul>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="font-serif text-2xl font-bold text-ink">{title}</h2>
      {children}
    </section>
  )
}

// The About text. It is the homepage for signed-out visitors and /about for everyone.
export default function AboutContent({ signedIn }: { signedIn: boolean }) {
  return (
    <article className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="font-serif text-5xl font-bold text-ink">BookBridge</h1>
      <p className="mt-5 text-lg leading-relaxed text-ink-light">
        BookBridge translates EPUB and TXT books with an AI model of your choice. It&rsquo;s built
        for long stories, where pasting chapters into a chatbot falls apart.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        {signedIn ? (
          <Link
            href="/dashboard"
            className="rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-white hover:bg-accent-hover"
          >
            Go to my library
          </Link>
        ) : (
          <>
            <Link
              href="/sign-up"
              className="rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-white hover:bg-accent-hover"
            >
              Get started
            </Link>
            <Link
              href="/sign-in"
              className="rounded-lg border border-spine/30 bg-white px-6 py-3 text-sm font-semibold text-ink hover:bg-paper"
            >
              Sign in
            </Link>
          </>
        )}
        {SAMPLE_READ_URL && (
          <Link
            href={SAMPLE_READ_URL}
            className="rounded-lg border border-spine/30 bg-white px-6 py-3 text-sm font-semibold text-ink hover:bg-paper"
          >
            Read a sample
          </Link>
        )}
      </div>

      {SCREENSHOTS.length > 0 && (
        <div className="mt-12 space-y-8">
          {SCREENSHOTS.map((shot) => (
            <figure key={shot.src}>
              <Image
                src={shot.src}
                alt={shot.alt}
                width={shot.width}
                height={shot.height}
                className="h-auto w-full rounded-xl border border-parchment shadow-sm"
              />
              <figcaption className="mt-2 text-center text-sm text-ink-muted">{shot.caption}</figcaption>
            </figure>
          ))}
        </div>
      )}

      <Section title="What it does differently">
        <ItemList items={DIFFERENCES} />
      </Section>

      <Section title="Some ways to use it">
        <ItemList items={USES} />
      </Section>

      <Section title="Before you start">
        <p className="mt-4 leading-relaxed text-ink-light">
          You&rsquo;ll need your own API key (OpenAI, DeepSeek, or any OpenAI-compatible provider).
          Add it in{' '}
          <Link href="/dashboard/settings" className="font-medium text-accent underline">
            Settings
          </Link>
          . Translation costs are billed by your provider, not by us.
        </p>
      </Section>

      <Section title="A few notes">
        <ul className="mt-4 list-disc space-y-2 pl-5 leading-relaxed text-ink-light">
          <li>It&rsquo;s machine translation, so it won&rsquo;t be perfect.</li>
          <li>
            Translations are for personal reading. If you want to share a translation of
            someone&rsquo;s fic, ask the author first.
          </li>
        </ul>
      </Section>

      <Section title="Background">
        <p className="mt-4 leading-relaxed text-ink-light">
          BookBridge started as a team project in a vibe coding course, where it translated PDFs.
          Afterwards I rebuilt most of it on my own: switched to EPUB and TXT, moved to
          paragraph-by-paragraph translation, added the editable name list and the whole-book
          scan, and wrote a small evaluation to see what actually keeps names consistent. The
          source is on{' '}
          <a
            href="https://github.com/Ashx-xhsA/bookbridge"
            className="font-medium text-accent underline"
          >
            GitHub
          </a>
          .
        </p>
      </Section>
    </article>
  )
}
