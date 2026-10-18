// What the About page shows off. Both are empty until a public-domain sample
// is translated on the live site: the page hides each block while it's empty.

// Public reader link (/read/<token>) of a published sample book.
export const SAMPLE_READ_URL: string | null = null

// Screenshots served from /public/screenshots.
export type Screenshot = { src: string; alt: string; caption: string; width: number; height: number }
export const SCREENSHOTS: Screenshot[] = []
