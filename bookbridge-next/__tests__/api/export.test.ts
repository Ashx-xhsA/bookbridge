/**
 * Phase 5d — GET /api/projects/[id]/export: the owner downloads the book as
 * Markdown (translation or bilingual) or as a bilingual EPUB (side by side
 * or stacked), built on the server from the segments in the database.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { strFromU8, unzipSync } from 'fflate'

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }))

const mockProjectFindUnique = vi.fn()

vi.mock('@/lib/prisma', () => ({
  default: {
    project: { findUnique: (...a: unknown[]) => mockProjectFindUnique(...a) },
  },
}))

import { auth } from '@clerk/nextjs/server'
type AuthReturn = Awaited<ReturnType<typeof auth>>

const project = {
  id: 'p1',
  title: '变形记',
  ownerId: 'user_abc',
  sourceLang: 'en',
  targetLang: 'zh-Hans',
  chapters: [
    {
      number: 1,
      title: 'One',
      segments: [
        { index: 0, source: 'He woke.', translation: '他醒了。', status: 'flagged',
          reviewIssues: [{ category: 'omission', severity: 'error', message: 'secret note' }] },
      ],
    },
  ],
}

function signIn(userId: string | null) {
  vi.mocked(auth).mockResolvedValueOnce({ userId } as AuthReturn)
}

async function get(query: string) {
  const { GET } = await import('@/app/api/projects/[id]/export/route')
  return GET(new NextRequest(`http://localhost:3000/api/projects/p1/export?${query}`), {
    params: Promise.resolve({ id: 'p1' }),
  })
}

describe('GET /api/projects/[id]/export', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when unauthenticated', async () => {
    signIn(null)
    expect((await get('format=md')).status).toBe(401)
    expect(mockProjectFindUnique).not.toHaveBeenCalled()
  })

  it('rejects an unknown format or a layout that does not fit the format', async () => {
    for (const q of ['format=pdf', 'format=md&layout=side', 'format=epub&layout=translation', '']) {
      signIn('user_abc')
      expect((await get(q)).status).toBe(400)
    }
    expect(mockProjectFindUnique).not.toHaveBeenCalled()
  })

  it('returns 404 for a missing project and 403 for someone else\'s', async () => {
    signIn('user_abc')
    mockProjectFindUnique.mockResolvedValueOnce(null)
    expect((await get('format=md')).status).toBe(404)
    signIn('user_other')
    mockProjectFindUnique.mockResolvedValueOnce(project)
    expect((await get('format=md')).status).toBe(403)
  })

  it('downloads the translation as Markdown by default, with a UTF-8 file name', async () => {
    signIn('user_abc')
    mockProjectFindUnique.mockResolvedValueOnce(project)
    const res = await get('format=md')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/markdown')
    const disposition = res.headers.get('content-disposition') ?? ''
    expect(disposition).toContain('attachment')
    expect(disposition).toContain(`filename*=UTF-8''${encodeURIComponent('变形记_translation.md')}`)
    const text = await res.text()
    expect(text).toContain('他醒了。')
    expect(text).not.toContain('He woke.')
    expect(text).not.toContain('secret note')
  })

  it('downloads a bilingual Markdown when asked', async () => {
    signIn('user_abc')
    mockProjectFindUnique.mockResolvedValueOnce(project)
    const text = await (await get('format=md&layout=bilingual')).text()
    expect(text).toContain('He woke.')
    expect(text).toContain('他醒了。')
  })

  it('downloads a side-by-side EPUB by default and a stacked one when asked', async () => {
    signIn('user_abc')
    mockProjectFindUnique.mockResolvedValueOnce(project)
    const side = await get('format=epub')
    expect(side.headers.get('content-type')).toBe('application/epub+zip')
    const sideCh = strFromU8(unzipSync(new Uint8Array(await side.arrayBuffer()))['OEBPS/ch001.xhtml'])
    expect(sideCh).toContain('<table class="side">')
    expect(sideCh).not.toContain('secret note')

    signIn('user_abc')
    mockProjectFindUnique.mockResolvedValueOnce(project)
    const stacked = await get('format=epub&layout=stacked')
    const stackedCh = strFromU8(unzipSync(new Uint8Array(await stacked.arrayBuffer()))['OEBPS/ch001.xhtml'])
    expect(stackedCh).not.toContain('<table')
    expect(stackedCh).toContain('<p class="tgt" lang="zh-Hans">他醒了。</p>')
  })
})
