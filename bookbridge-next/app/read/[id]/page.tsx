import { notFound } from 'next/navigation'
import Link from 'next/link'
import prisma from '@/lib/prisma'

const demoChapters = [
  {
    number: 1,
    title: 'The Drawing',
    source: `Once when I was six years old I saw a magnificent picture in a book, called True Stories from Nature, about the primeval forest. It was a picture of a boa constrictor in the act of swallowing an animal. Here is a copy of the drawing.

In the book it said: "Boa constrictors swallow their prey whole, without chewing it. After that they are not able to move, and they sleep through the six months that they need for digestion."

I pondered deeply, then, over the adventures of the jungle. And after some work with a colored pencil I succeeded in making my first drawing. My Drawing Number One. I showed my masterpiece to the grown-ups, and asked them whether the drawing frightened them.

But they answered: "Frighten? Why should any one be frightened by a hat?"

My drawing was not a picture of a hat. It was a picture of a boa constrictor digesting an elephant. But since the grown-ups were not able to understand it, I made another drawing: I drew the inside of a boa constrictor, so that the grown-ups could see it clearly. They always need to have things explained.`,
    translation: `我六岁的时候，在一本描述原始森林的，名叫《真实的故事》的书中，看到了一幅精彩的插画。画的是一条蟒蛇正在吞食一只动物。这里是那幅画的摹本。

书中写道："蟒蛇把猎物整个吞下去，一点也不咀嚼。此后它们就不能动弹了，要睡上六个月来消化食物。"

那时我对丛林中的奇遇想了很多，最后用彩色铅笔画出了我的第一幅画。我的第一号作品。我把我的杰作拿给大人看，问他们我的画是不是让他们害怕。

他们回答说："害怕？一顶帽子有什么可怕的？"

我画的不是一顶帽子。我画的是一条蟒蛇在消化一头大象。但是大人们看不懂，我只好又画了一幅画——把蟒蛇的内部画了出来，好让大人们能够看明白。他们总是需要别人给他们解释。`,
  },
  {
    number: 2,
    title: 'The Pilot',
    source: `So then I chose another profession, and learned to pilot airplanes. I have flown a little over all parts of the world; and it is true that geography has been very useful to me. At a glance I can distinguish China from Arizona. If one gets lost in the night, such knowledge is valuable.

In the course of this life I have had a great many encounters with a great many people who have been concerned with matters of consequence. I have lived a great deal among grown-ups. I have seen them intimately, close at hand. And that hasn't much improved my opinion of them.

Whenever I met one of them who seemed to me at all clear-sighted, I tried the experiment of showing him my Drawing Number One, which I have always kept. I would try to find out, so, if this was a person of true understanding. But, whoever it was, he, or she, would always say: "That is a hat."

Then I would never talk to that person about boa constrictors, or primeval forests, or stars. I would bring myself down to his level. I would talk to him about bridge, and golf, and politics, and neckties. And the grown-up would be greatly pleased to have met such a sensible man.`,
    translation: `于是我就选择了另外一个职业，学会了开飞机。我差不多飞遍了世界各地，地理学确实对我很有帮助。我一眼就能看出中国和亚利桑那。在夜间迷了路，这样的知识是很有用的。

在我的生活中，我跟许许多多严肃的人有过很多的接触。我在大人中间生活了很长时间。我仔细地观察过他们，但这并没有使我对他们的看法有多大的改变。

每当我遇到一个头脑看起来稍微清楚一点的大人时，我就拿出一直保存着的我的那幅第一号作品来测验测验他。我想知道他是不是真的有理解力。可是，得到的回答总是："这是顶帽子。"

于是我就不和他谈蟒蛇了，也不谈原始森林和星星了。我把自己放在他的水平上。我和他谈桥牌、谈高尔夫球、谈政治、谈领带。于是大人就很高兴能认识一个这样通情达理的人。`,
  },
]

export default async function ReaderPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  if (id === 'demo') {
    return <ReaderView title="The Little Prince" subtitle="小王子" sourceLang="English" targetLang="中文" chapters={demoChapters} isDemo />
  }

  const project = await prisma.project.findUnique({
    where: { id, isPublic: true },
    include: { chapters: { orderBy: { number: 'asc' } } },
  })

  if (!project) notFound()

  const chapters = project.chapters.map((ch) => ({
    number: ch.number,
    title: ch.title,
    source: ch.sourceContent || '',
    translation: ch.translation || '',
  }))

  return <ReaderView title={project.title} sourceLang={project.sourceLang} targetLang={project.targetLang} chapters={chapters} />
}

function ReaderView({
  title,
  subtitle,
  sourceLang = 'English',
  targetLang = 'Translation',
  chapters,
  isDemo,
}: {
  title: string
  subtitle?: string
  sourceLang?: string
  targetLang?: string
  chapters: { number: number; title: string; source: string; translation: string }[]
  isDemo?: boolean
}) {
  return (
    <div className="min-h-screen bg-cream">
      <header className="sticky top-0 z-10 border-b border-parchment bg-cream/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white font-serif text-sm font-bold"
            >
              B
            </Link>
            <div className="hidden sm:block">
              <span className="font-serif font-semibold text-ink">{title}</span>
              {subtitle && (
                <span className="ml-2 text-sm text-ink-muted">{subtitle}</span>
              )}
            </div>
          </div>
          {isDemo && (
            <Link
              href="/sign-up"
              className="rounded-lg bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent-hover"
            >
              Sign Up to Translate Your Book
            </Link>
          )}
        </div>
      </header>

      <div className="flex">
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 overflow-y-auto border-r border-parchment bg-paper/50 p-5 lg:block">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-muted">
            Contents
          </p>
          <nav className="mt-4 space-y-1">
            {chapters.map((ch) => (
              <a
                key={ch.number}
                href={`#ch-${ch.number}`}
                className="block rounded-md px-3 py-2 text-sm text-ink-light hover:bg-parchment/50 hover:text-ink transition-colors"
              >
                <span className="text-ink-muted">{ch.number}.</span> {ch.title}
              </a>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mx-auto max-w-5xl px-6 py-10">
            <div className="mb-12 text-center">
              <h1 className="font-serif text-4xl font-bold text-ink">{title}</h1>
              {subtitle && (
                <p className="mt-2 font-serif text-2xl text-ink-muted">{subtitle}</p>
              )}
              <p className="mt-4 text-sm text-ink-muted">
                {sourceLang} → {targetLang} &middot; {chapters.length} chapters
              </p>
            </div>

            <div className="space-y-16">
              {chapters.map((ch) => (
                <section key={ch.number} id={`ch-${ch.number}`}>
                  <div className="mb-6 border-b border-parchment pb-4">
                    <p className="text-xs font-medium uppercase tracking-widest text-accent">
                      Chapter {ch.number}
                    </p>
                    <h2 className="mt-1 font-serif text-2xl font-bold text-ink">
                      {ch.title}
                    </h2>
                  </div>

                  <div className="grid gap-8 md:grid-cols-2">
                    <div>
                      <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-ink-muted">
                        {sourceLang}
                      </p>
                      <div className="font-serif text-[15px] leading-[1.9] text-ink whitespace-pre-wrap">
                        {ch.source || (
                          <span className="italic text-ink-muted">
                            Content not available
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="rounded-xl bg-accent-light/30 p-6">
                      <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-accent">
                        {targetLang}
                      </p>
                      <div className="font-serif text-[15px] leading-[1.9] text-ink whitespace-pre-wrap">
                        {ch.translation || (
                          <span className="italic text-ink-muted">
                            Not yet translated
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </section>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
