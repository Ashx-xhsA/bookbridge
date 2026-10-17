import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { SEGMENT_ROW, publicRows, toAlignedRows } from '@/lib/reader'
import { buildEpub, buildMarkdown, exportFilename, type ExportBook } from '@/lib/export'

// Owner download of the whole book, built from the segments in the database:
//   ?format=md[&layout=translation|bilingual]
//   ?format=epub[&layout=side|stacked]
// Review status and issues never go into an export.

const querySchema = z.union([
  z.object({ format: z.literal('md'), layout: z.enum(['translation', 'bilingual']).default('translation') }),
  z.object({ format: z.literal('epub'), layout: z.enum(['side', 'stacked']).default('side') }),
])

function attachment(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const parsed = querySchema.safeParse({
    format: sp.get('format') ?? undefined,
    layout: sp.get('layout') ?? undefined,
  })
  const id = z.string().min(1).max(128).safeParse((await params).id)
  if (!parsed.success || !id.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const project = await prisma.project.findUnique({
    where: { id: id.data },
    select: {
      id: true,
      title: true,
      ownerId: true,
      sourceLang: true,
      targetLang: true,
      chapters: { orderBy: { number: 'asc' }, select: { number: true, title: true, segments: SEGMENT_ROW } },
    },
  })
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (project.ownerId !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const book: ExportBook = {
    id: project.id,
    title: project.title,
    sourceLang: project.sourceLang,
    targetLang: project.targetLang,
    chapters: project.chapters.map((c) => ({
      number: c.number,
      title: c.title,
      rows: publicRows(toAlignedRows(c.segments)),
    })),
  }

  const { format, layout } = parsed.data
  if (format === 'md') {
    const name = exportFilename(`${book.title} ${layout}`, 'md')
    return new NextResponse(buildMarkdown(book, layout), {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': attachment(name),
        'Cache-Control': 'no-store',
      },
    })
  }

  const name = exportFilename(`${book.title} bilingual ${layout}`, 'epub')
  return new NextResponse(Buffer.from(buildEpub(book, layout)), {
    headers: {
      'Content-Type': 'application/epub+zip',
      'Content-Disposition': attachment(name),
      'Cache-Control': 'no-store',
    },
  })
}
