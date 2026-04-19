import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { getPublishedProject } from '@/lib/public-project'

const paramsSchema = z.object({
  token: z.string().min(1),
  chunkId: z.string().min(1),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string; chunkId: string }> },
) {
  const awaited = await params
  const parsed = paramsSchema.safeParse(awaited)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { token, chunkId } = parsed.data

  const project = await getPublishedProject(token)
  if (!project) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 404 })
  }

  const chapter = await prisma.chapter.findUnique({
    where: { id: chunkId },
    select: { projectId: true, sourceContent: true, translation: true },
  })

  // Cross-project access returns 404 (not 403) so we never confirm the chunk
  // exists outside the token's project scope.
  if (!chapter || chapter.projectId !== project.id) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 404 })
  }

  return NextResponse.json({
    data: {
      originalText: chapter.sourceContent,
      translatedText: chapter.translation,
    },
  })
}
