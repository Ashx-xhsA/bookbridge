import { describe, it, expect } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import { buildEpub, buildMarkdown, exportFilename, type ExportBook } from '@/lib/export'

const book: ExportBook = {
  id: 'proj1',
  title: 'Tom & Jerry <1>',
  sourceLang: 'en',
  targetLang: 'zh-Hans',
  chapters: [
    {
      number: 1,
      title: 'Cats & Mice',
      rows: [
        { index: 0, source: 'Tom chased <Jerry>.', translation: '汤姆追着“杰瑞”。' },
        { index: 1, source: 'Jerry hid.', translation: null },
      ],
    },
    {
      number: 2,
      title: 'Untouched',
      rows: [{ index: 0, source: 'Nothing yet.', translation: null }],
    },
  ],
}

const MODIFIED = new Date('2026-10-17T12:34:56.789Z')

function files(layout: 'side' | 'stacked' = 'side') {
  const zip = buildEpub(book, layout, MODIFIED)
  return { zip, entries: unzipSync(zip) }
}

describe('buildMarkdown', () => {
  it('translation layout: translated paragraphs, a marker for untranslated ones', () => {
    const md = buildMarkdown(book, 'translation')
    expect(md).toContain('# Tom & Jerry <1>')
    expect(md).toContain('## Cats & Mice')
    expect(md).not.toMatch(/Chapter \d/)
    expect(md).toContain('汤姆追着“杰瑞”。')
    expect(md).not.toContain('Tom chased')
    expect(md).toContain('*[Not yet translated]*')
  })

  it('translation layout: one marker for a chapter with nothing translated', () => {
    const md = buildMarkdown(book, 'translation')
    const ch2 = md.slice(md.indexOf('## Untouched'))
    expect(ch2.match(/Not yet translated/g)).toHaveLength(1)
  })

  it('bilingual layout: each source paragraph followed by its translation', () => {
    const md = buildMarkdown(book, 'bilingual')
    const src = md.indexOf('Tom chased <Jerry>.')
    const tgt = md.indexOf('汤姆追着“杰瑞”。')
    const next = md.indexOf('Jerry hid.')
    expect(src).toBeGreaterThan(-1)
    expect(src).toBeLessThan(tgt)
    expect(tgt).toBeLessThan(next)
  })
})

describe('buildEpub — container', () => {
  it('stores mimetype first and uncompressed, as EPUB requires', () => {
    const { zip } = files()
    const view = new DataView(zip.buffer, zip.byteOffset)
    expect(view.getUint32(0, true)).toBe(0x04034b50) // local file header
    expect(view.getUint16(8, true)).toBe(0) // compression: stored
    const nameLen = view.getUint16(26, true)
    const extraLen = view.getUint16(28, true)
    expect(strFromU8(zip.subarray(30, 30 + nameLen))).toBe('mimetype')
    expect(strFromU8(zip.subarray(30 + nameLen + extraLen, 30 + nameLen + extraLen + 20))).toBe(
      'application/epub+zip'
    )
  })

  it('points container.xml at the package document', () => {
    const { entries } = files()
    expect(strFromU8(entries['META-INF/container.xml'])).toContain('full-path="OEBPS/content.opf"')
  })

  it('declares metadata, both languages and every chapter in reading order', () => {
    const { entries } = files()
    const opf = strFromU8(entries['OEBPS/content.opf'])
    expect(opf).toContain('<dc:title>Tom &amp; Jerry &lt;1&gt;</dc:title>')
    expect(opf).toContain('<dc:language>zh-Hans</dc:language>')
    expect(opf).toContain('<dc:language>en</dc:language>')
    expect(opf).toContain('urn:bookbridge:proj1')
    expect(opf).toContain('<meta property="dcterms:modified">2026-10-17T12:34:56Z</meta>')
    expect(opf.indexOf('idref="ch001"')).toBeLessThan(opf.indexOf('idref="ch002"'))
    expect(entries['OEBPS/ch001.xhtml']).toBeDefined()
    expect(entries['OEBPS/ch002.xhtml']).toBeDefined()
  })

  it('has a table of contents with escaped chapter titles', () => {
    const { entries } = files()
    const nav = strFromU8(entries['OEBPS/nav.xhtml'])
    expect(nav).toContain('epub:type="toc"')
    expect(nav).toContain('href="ch001.xhtml"')
    expect(nav).toContain('Cats &amp; Mice')
    expect(nav).not.toMatch(/Chapter \d/)
    const ch1 = strFromU8(entries['OEBPS/ch001.xhtml'])
    expect(ch1).toContain('<h2>Cats &amp; Mice</h2>')
  })
})

describe('buildEpub — side-by-side layout', () => {
  it('puts source left and translation right in one table row per paragraph', () => {
    const ch1 = strFromU8(files('side').entries['OEBPS/ch001.xhtml'])
    expect(ch1).toContain('<table class="side">')
    expect(ch1).toMatch(
      /<tr><td class="src" lang="en">Tom chased &lt;Jerry&gt;\.<\/td><td class="tgt" lang="zh-Hans">汤姆追着“杰瑞”。<\/td><\/tr>/
    )
  })

  it('keeps an empty translation cell for an untranslated paragraph', () => {
    const ch1 = strFromU8(files('side').entries['OEBPS/ch001.xhtml'])
    expect(ch1).toContain('<td class="src" lang="en">Jerry hid.</td><td class="tgt missing" lang="zh-Hans"></td>')
  })

  it('falls back to stacked cells on narrow screens', () => {
    const css = strFromU8(files('side').entries['OEBPS/style.css'])
    expect(css).toMatch(/@media[^{]*max-width[^{]*\{[^}]*td[^}]*\{[^}]*display:\s*block/)
  })
})

describe('buildEpub — stacked layout', () => {
  it('puts each translation paragraph right under its source paragraph', () => {
    const ch1 = strFromU8(files('stacked').entries['OEBPS/ch001.xhtml'])
    expect(ch1).not.toContain('<table')
    expect(ch1).toContain(
      '<p class="src" lang="en">Tom chased &lt;Jerry&gt;.</p><p class="tgt" lang="zh-Hans">汤姆追着“杰瑞”。</p>'
    )
  })

  it('leaves out the translation of an untranslated paragraph', () => {
    const ch1 = strFromU8(files('stacked').entries['OEBPS/ch001.xhtml'])
    expect(ch1).toContain('<p class="src" lang="en">Jerry hid.</p></div>')
  })
})

describe('exportFilename', () => {
  it('keeps letters of any script and replaces the rest', () => {
    expect(exportFilename('变形记: Kafka/1', 'epub')).toBe('变形记_Kafka_1.epub')
    expect(exportFilename('???', 'md')).toBe('book.md')
  })
})
