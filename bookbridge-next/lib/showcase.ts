// What the About page shows off: a public-domain sample translated on the
// live site. The page hides each block while it's empty.

// Public reader link of the published sample, opening at Chapter I (#ch-3;
// the Front Matter before it is left untranslated).
export const SAMPLE_READ_URL: string | null =
  '/read/b08d4e01-aa99-4d9c-9064-50abe651ae73#ch-3'

export const SAMPLE_CREDIT =
  'Sample: Wuthering Heights by Emily Brontë, a public-domain book downloaded from Project Gutenberg and translated into Chinese with BookBridge.'

// Screenshots served from /public/screenshots, each shown beside the feature it illustrates.
export type Screenshot = { src: string; alt: string; width: number; height: number }
export type ShowcaseFeature = 'reader' | 'names' | 'book'
export const SCREENSHOTS: Partial<Record<ShowcaseFeature, Screenshot>> = {
  reader: {
    src: '/screenshots/reader.webp',
    alt: 'The bilingual reader showing Chapter I in English and Chinese',
    width: 1600,
    height: 938,
  },
  names: {
    src: '/screenshots/glossary.webp',
    alt: 'The glossary listing character and place names with their Chinese translations',
    width: 1600,
    height: 997,
  },
  book: {
    src: '/screenshots/project.webp',
    alt: 'A book page with its public reading link and the double-check switch',
    width: 1600,
    height: 490,
  },
}
