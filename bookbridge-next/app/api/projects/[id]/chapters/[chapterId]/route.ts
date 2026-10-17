import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { requireProjectOwner } from '@/lib/project-auth'
import { SEGMENT_ROW, toAlignedRows } from '@/lib/reader'

// One chapter's paragraphs for the owner's reader, aligned row by row, with
// each paragraph's review status and open issues. Loaded per chapter so the
// reader never pulls the whole book at once.

const paramsSchema = z.object({
  id: z.string().min(1).max(128),
  chapterId: z.string().min(1).max(128),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; chapterId: string }> }
) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = paramsSchema.safeParse(await params)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  const { id, chapterId } = parsed.data

  const guard = await requireProjectOwner(id, userId)
  if (!guard.ok) return guard.response

  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: { id: true, projectId: true, number: true, title: true, segments: SEGMENT_ROW },
  })
  if (!chapter || chapter.projectId !== id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({
    data: {
      id: chapter.id,
      number: chapter.number,
      title: chapter.title,
      segments: toAlignedRows(chapter.segments),
    },
  })
}
