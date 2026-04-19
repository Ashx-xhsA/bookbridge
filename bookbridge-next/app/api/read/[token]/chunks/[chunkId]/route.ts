import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { getPublishedProjectId, tokenSchema } from '@/lib/public-project'

const paramsSchema = z.object({
  token: tokenSchema,
  chunkId: z.string().min(1).max(256),
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

  // Run both queries in parallel so "unknown token" and "token ok but chunk
  // missing/cross-project" take identical wall-clock time — closes the timing
  // side-channel an attacker could otherwise use to enumerate valid tokens.
  const [projectId, chapter] = await Promise.all([
    getPublishedProjectId(token),
    prisma.chapter.findUnique({
      where: { id: chunkId },
      select: { projectId: true, sourceContent: true, translation: true },
    }),
  ])

  if (!projectId) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 404 })
  }

  // Chunk-level 404: missing, cross-project IDOR, or source not yet ingested.
  // Different error body ("Not found") than the project-level 404 because the
  // token is valid here — the ambiguity the enumeration-prevention rule is
  // about (project existence) is not at risk from this branch.
  if (
    !chapter ||
    chapter.projectId !== projectId ||
    chapter.sourceContent === null
  ) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({
    data: {
      originalText: chapter.sourceContent,
      translatedText: chapter.translation,
    },
  })
}
