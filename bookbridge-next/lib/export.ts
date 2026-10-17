import { strToU8, zipSync, type Zippable } from 'fflate'
import type { PublicRow } from '@/lib/reader'

// Book export, built on the server from aligned segment rows: Markdown
// (translation only, or source + translation) and a bilingual EPUB 3, with
// paragraphs side by side in a table or stacked (source, then translation).

export interface ExportBook {
  id: string
  title: string
  sourceLang: string
  targetLang: string
  chapters: { number: number; title: string; rows: PublicRow[] }[]
}

export type MarkdownLayout = 'translation' | 'bilingual'
export type EpubLayout = 'side' | 'stacked'

const UNTRANSLATED_MD = '*[Not yet translated]*'

export function buildMarkdown(book: ExportBook, layout: MarkdownLayout): string {
  const parts = [`# ${book.title}`, `${book.sourceLang} → ${book.targetLang}`, '---']
  for (const ch of book.chapters) {
    parts.push(`## ${ch.title}`)
    if (layout === 'translation' && !ch.rows.some((r) => r.translation)) {
      parts.push('*Not yet translated*')
    } else {
      for (const r of ch.rows) {
        if (layout === 'bilingual') parts.push(r.source)
        parts.push(r.translation ?? UNTRANSLATED_MD)
      }
    }
    parts.push('---')
  }
  return `${parts.join('\n\n')}\n`
}

export function exportFilename(title: string, ext: string): string {
  const base = title.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '')
  return `${base || 'book'}.${ext}`
}

// --- EPUB -----------------------------------------------------------------

// Escape for XML text and attributes; drop control characters XML forbids.
function xml(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// Paragraph text with its own line breaks kept (verse, letters).
function para(text: string): string {
  return xml(text).replace(/\r?\n/g, '<br/>')
}

const chapterFile = (i: number) => `ch${String(i + 1).padStart(3, '0')}.xhtml`
const chapterId = (i: number) => `ch${String(i + 1).padStart(3, '0')}`
// Chapters keep their own titles; the book's numbering is in them already.
const chapterHeading = (ch: ExportBook['chapters'][number]) => ch.title

const CONTAINER = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`

const STYLE = `body { margin: 0 4%; line-height: 1.7; }
h1, h2 { text-align: center; }
h2 { margin: 1.5em 0 1em; }
.src { color: #555; }
table.side { width: 100%; border-collapse: collapse; }
table.side td { width: 50%; vertical-align: top; padding: 0 0.6em 1.1em; }
div.pair { margin: 0 0 1.1em; }
div.pair p { margin: 0; }
div.pair p.src { margin-bottom: 0.3em; }
p.missing { font-style: italic; color: #999; }
@media (max-width: 600px) {
  table.side td { display: block; width: auto; padding: 0 0 0.3em; }
  table.side td.tgt { padding-bottom: 1.1em; }
}
`

function sideRows(book: ExportBook, rows: PublicRow[]): string {
  const src = `class="src" lang="${xml(book.sourceLang)}"`
  const lang = `lang="${xml(book.targetLang)}"`
  const trs = rows.map((r) =>
    r.translation
      ? `<tr><td ${src}>${para(r.source)}</td><td class="tgt" ${lang}>${para(r.translation)}</td></tr>`
      : `<tr><td ${src}>${para(r.source)}</td><td class="tgt missing" ${lang}></td></tr>`
  )
  return `<table class="side">\n<tbody>\n${trs.join('\n')}\n</tbody>\n</table>`
}

function stackedRows(book: ExportBook, rows: PublicRow[]): string {
  return rows
    .map((r) => {
      const src = `<p class="src" lang="${xml(book.sourceLang)}">${para(r.source)}</p>`
      const tgt = r.translation
        ? `<p class="tgt" lang="${xml(book.targetLang)}">${para(r.translation)}</p>`
        : ''
      return `<div class="pair">${src}${tgt}</div>`
    })
    .join('\n')
}

function xhtmlPage(book: ExportBook, title: string, body: string, extraNs = ''): string {
  const lang = xml(book.targetLang)
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"${extraNs} xml:lang="${lang}" lang="${lang}">
<head>
<meta charset="UTF-8"/>
<title>${xml(title)}</title>
<link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
${body}
</body>
</html>
`
}

function chapterPage(book: ExportBook, ch: ExportBook['chapters'][number], layout: EpubLayout): string {
  const heading = chapterHeading(ch)
  const content =
    ch.rows.length === 0
      ? '<p class="missing">No content</p>'
      : layout === 'side'
        ? sideRows(book, ch.rows)
        : stackedRows(book, ch.rows)
  return xhtmlPage(book, heading, `<section epub:type="chapter">\n<h2>${xml(heading)}</h2>\n${content}\n</section>`)
}

function navPage(book: ExportBook): string {
  const items = book.chapters
    .map((ch, i) => `<li><a href="${chapterFile(i)}">${xml(chapterHeading(ch))}</a></li>`)
    .join('\n')
  return xhtmlPage(
    book,
    book.title,
    `<nav epub:type="toc" id="toc">\n<h1>${xml(book.title)}</h1>\n<ol>\n${items}\n</ol>\n</nav>`
  )
}

// EPUB 2 table of contents, for older readers that ignore nav.xhtml.
function ncx(book: ExportBook): string {
  const points = book.chapters
    .map(
      (ch, i) =>
        `<navPoint id="np${i + 1}" playOrder="${i + 1}"><navLabel><text>${xml(chapterHeading(ch))}</text></navLabel><content src="${chapterFile(i)}"/></navPoint>`
    )
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head><meta name="dtb:uid" content="urn:bookbridge:${xml(book.id)}"/></head>
<docTitle><text>${xml(book.title)}</text></docTitle>
<navMap>
${points}
</navMap>
</ncx>
`
}

function packageDoc(book: ExportBook, modified: Date): string {
  const items = book.chapters
    .map((_, i) => `<item id="${chapterId(i)}" href="${chapterFile(i)}" media-type="application/xhtml+xml"/>`)
    .join('\n    ')
  const refs = book.chapters.map((_, i) => `<itemref idref="${chapterId(i)}"/>`).join('\n    ')
  const stamp = modified.toISOString().replace(/\.\d{3}Z$/, 'Z')
  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${xml(book.targetLang)}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:bookbridge:${xml(book.id)}</dc:identifier>
    <dc:title>${xml(book.title)}</dc:title>
    <dc:language>${xml(book.targetLang)}</dc:language>
    <dc:language>${xml(book.sourceLang)}</dc:language>
    <meta property="dcterms:modified">${stamp}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="css" href="style.css" media-type="text/css"/>
    ${items}
  </manifest>
  <spine toc="ncx">
    ${refs}
  </spine>
</package>
`
}

export function buildEpub(book: ExportBook, layout: EpubLayout, modified = new Date()): Uint8Array {
  // mimetype must be the first entry and stored uncompressed.
  const files: Zippable = {
    mimetype: [strToU8('application/epub+zip'), { level: 0 }],
    'META-INF/container.xml': strToU8(CONTAINER),
    'OEBPS/content.opf': strToU8(packageDoc(book, modified)),
    'OEBPS/nav.xhtml': strToU8(navPage(book)),
    'OEBPS/toc.ncx': strToU8(ncx(book)),
    'OEBPS/style.css': strToU8(STYLE),
  }
  book.chapters.forEach((ch, i) => {
    files[`OEBPS/${chapterFile(i)}`] = strToU8(chapterPage(book, ch, layout))
  })
  return zipSync(files, { level: 6 })
}
