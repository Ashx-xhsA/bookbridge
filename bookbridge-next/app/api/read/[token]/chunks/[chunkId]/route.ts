import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { joinSegments, joinTranslations } from '@/lib/segments'
import { SEGMENT_ROW, publicRows, toAlignedRows } from '@/lib/reader'
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
      select: { projectId: true, segments: SEGMENT_ROW },
    }),
  ])

  if (!projectId) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 404 })
  }

  // Chunk-level 404: missing, cross-project IDOR, or no segments ingested.
  // Different error body ("Not found") than the project-level 404 because the
  // token is valid here — the ambiguity the enumeration-prevention rule is
  // about (project existence) is not at risk from this branch.
  if (
    !chapter ||
    chapter.projectId !== projectId ||
    chapter.segments.length === 0
  ) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({
    data: {
      originalText: joinSegments(chapter.segments),
      translatedText: joinTranslations(chapter.segments),
      // One row per paragraph for the aligned reader; review status and
      // issues are owner-only and stripped here.
      segments: publicRows(toAlignedRows(chapter.segments)),
    },
  })
}
