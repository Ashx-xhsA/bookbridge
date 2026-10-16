// Upper bound on a book's text, checked after parsing. Pages that list a whole
// book (project page, bible review) load all of it, and scans and translations
// are paid per character; ~1.5M chars covers almost any single novel (a
// 100k-word novel is ~0.6M). Longer books should be uploaded in volumes.
export const MAX_BOOK_CHARS = 1_500_000

// Vercel functions accept request bodies up to about 4.5 MB; larger uploads
// would fail before reaching the route, so the form rejects them up front.
export const MAX_UPLOAD_BYTES = 4.5 * 1024 * 1024

export function bookChars(chapters: { paragraphs: string[] }[]): number {
  return chapters.reduce((sum, ch) => sum + ch.paragraphs.reduce((n, p) => n + p.length, 0), 0)
}
