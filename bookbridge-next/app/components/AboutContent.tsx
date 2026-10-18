import Link from 'next/link'
import Image from 'next/image'
import {
  SAMPLE_CREDIT,
  SAMPLE_READ_URL,
  SCREENSHOTS,
  type Screenshot,
  type ShowcaseFeature,
} from '@/lib/showcase'

type Item = { title: string; text: string }

// The first difference has no screenshot; it leads the section.
const NOTES: Item = {
  title: 'Your own translation notes.',
  text: 'Tell it how you want the book translated, like the tone, the style, or what to leave as is. Optionally, let it scan the whole book first and draft notes on the plot and characters for you.',
}

// The rest each sit beside the screenshot that shows them.
const FEATURES: (Item & { shot: ShowcaseFeature })[] = [
  {
    shot: 'reader',
    title: 'Context for every paragraph.',
    text: 'Each paragraph is translated with the names that appear in it and the few paragraphs before it, so chapter 30 still knows what chapter 1 decided.',
  },
  {
    shot: 'names',
    title: 'You control the names.',
    text: 'Character and place names go into an editable list. Change a name once and every chapter follows.',
  },
  {
    shot: 'book',
    title: 'Optional double-check.',
    text: 'Turn it on per book to have a second AI pass catch mistranslations and fix them. Slower and uses more tokens.',
  },
]

const USES: Item[] = [
  {
    title: 'Untranslated web novels.',
    text: 'Read the ones nobody has translated yet.',
  },
  {
    title: 'Language practice.',
    text: 'Read something you actually like, original and translation side by side.',
  },
  {
    title: 'Just a few chapters.',
    text: 'No need to translate the whole book.',
  },
  {
    title: 'AO3 fics.',
    text: 'Download a fic as EPUB from AO3 and upload it here.',
  },
  {
    title: 'Take it with you.',
    text: 'Export a bilingual EPUB, or share a reading link.',
  },
]

function ItemText({ item }: { item: Item }) {
  return (
    <p className="leading-relaxed text-ink-light">
      <span className="font-semibold text-ink">{item.title}</span> {item.text}
    </p>
  )
}

function Section({
  title,
  children,
  className = 'mt-16 max-w-3xl',
}: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={className}>
      <h2 className="font-serif text-2xl font-bold text-ink">{title}</h2>
      {children}
    </section>
  )
}

// A screenshot in a browser-window frame, so it reads as the app.
function Framed({ shot }: { shot: Screenshot }) {
  return (
    <div className="overflow-hidden rounded-xl border border-parchment bg-white shadow-[0_12px_40px_-12px_rgba(0,0,0,0.18)]">
      <div
        className="flex items-center gap-1.5 border-b border-parchment bg-paper px-4 py-2.5"
        aria-hidden="true"
      >
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
      </div>
      <Image
        src={shot.src}
        alt={shot.alt}
        width={shot.width}
        height={shot.height}
        unoptimized
        className="block h-auto w-full"
      />
    </div>
  )
}

// One feature per row: the screenshot takes two thirds, the text one third,
// and the sides swap every row. On narrow screens the screenshot comes first.
function FeatureRows() {
  return (
    <div className="mt-8 space-y-16">
      {FEATURES.map((feature, i) => {
        const shot = SCREENSHOTS[feature.shot]
        if (!shot) {
          return (
            <div key={feature.title} className="max-w-3xl">
              <ItemText item={feature} />
            </div>
          )
        }
        const flip = i % 2 === 1
        return (
          <div
            key={feature.title}
            className="grid items-center gap-8 lg:grid-cols-3"
          >
            <div className={`lg:col-span-2 ${flip ? 'lg:order-2' : ''}`}>
              <Framed shot={shot} />
            </div>
            <div className={flip ? 'lg:order-1' : ''}>
              <h3 className="font-serif text-xl font-bold text-ink">
                {feature.title}
              </h3>
              <p className="mt-3 leading-relaxed text-ink-light">
                {feature.text}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// The About text. It is the homepage for signed-out visitors and /about for everyone.
export default function AboutContent({ signedIn }: { signedIn: boolean }) {
  const hasShots = FEATURES.some((f) => SCREENSHOTS[f.shot])
  return (
    <article className="mx-auto max-w-6xl px-6 py-16">
      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_38%]">
        <div>
          <h1 className="font-serif text-5xl font-bold text-ink">BookBridge</h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-light">
            BookBridge translates EPUB and TXT books with an AI model of your
            choice. It&rsquo;s built for long stories, where pasting chapters
            into a chatbot falls apart.
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

          {/* The lead difference sits under the buttons, beside the card. */}
          <h2 className="mt-12 font-serif text-2xl font-bold text-ink">
            What it does differently
          </h2>
          <div className="mt-4">
            <ItemText item={NOTES} />
          </div>
        </div>

        {/* Ways to use it fill the space beside the intro on wide screens. */}
        <section className="rounded-xl border border-parchment bg-paper px-6 py-5">
          <h2 className="font-serif text-xl font-bold text-ink">
            Some ways to use it
          </h2>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed">
            {USES.map((item) => (
              <li key={item.title} className="text-ink-light">
                <span className="font-semibold text-ink">{item.title}</span>{' '}
                {item.text}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section>
        <FeatureRows />
        {/* Same grid as the rows, so the line stays within the screenshot's width. */}
        {hasShots && (
          <div className="mt-10 grid gap-8 lg:grid-cols-3">
            <p className="text-xs text-ink-muted lg:col-span-2">
              {SAMPLE_CREDIT}
            </p>
          </div>
        )}
      </section>

      <div className="mt-16 grid gap-12 lg:grid-cols-2">
        <Section title="Before you start" className="">
          <p className="mt-4 leading-relaxed text-ink-light">
            You&rsquo;ll need your own API key (OpenAI, DeepSeek, or any
            OpenAI-compatible provider). Add it in{' '}
            <Link
              href="/dashboard/settings"
              className="font-medium text-accent hover:underline"
            >
              Settings
            </Link>
            . Translation costs are billed by your provider, not by us.
          </p>
        </Section>

        <Section title="A few notes" className="">
          <ul className="mt-4 list-disc space-y-2 pl-5 leading-relaxed text-ink-light">
            <li>
              It&rsquo;s machine translation, so it won&rsquo;t be perfect.
            </li>
            <li>
              Translations are for personal reading. If you want to share a
              translation of someone&rsquo;s fic, ask the author first.
            </li>
          </ul>
        </Section>
      </div>

      {/* A quiet, centred footnote rather than another headline section. */}
      <section className="mt-20 border-t border-parchment pt-6 text-center">
        <h2 className="text-sm font-semibold text-ink-light">Background</h2>
        <p className="mx-auto mt-2 max-w-3xl text-sm leading-relaxed text-ink-muted">
          BookBridge started as a team project in a vibe coding course, where it
          translated PDFs. Afterwards I rebuilt most of it on my own: switched
          to EPUB and TXT, moved to paragraph-by-paragraph translation, added
          the editable name list and the whole-book scan, and wrote a small
          evaluation to see what actually keeps names consistent.
          <br />
          The source is on{' '}
          <a
            href="https://github.com/Ashx-xhsA/bookbridge"
            className="text-ink-light underline hover:text-ink"
          >
            GitHub
          </a>
          .
        </p>
      </section>
    </article>
  )
}
