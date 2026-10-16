import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { CHAPTER_PROGRESS, isChapterDone } from '@/lib/segments'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const project = await prisma.project.findUnique({
    where: { id },
    select: { ownerId: true },
  })
  if (!project || project.ownerId !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const chapters = await prisma.chapter.findMany({
    where: { projectId: id },
    select: { id: true, number: true, title: true, ...CHAPTER_PROGRESS },
    orderBy: { number: 'asc' },
  })

  const untranslated = chapters
    .filter((c) => c._count.segments > 0 && !isChapterDone(c))
    .map((c) => ({ id: c.id, number: c.number, title: c.title }))

  return NextResponse.json({
    total: chapters.length,
    translated: chapters.filter(isChapterDone).length,
    untranslated,
  })
}
