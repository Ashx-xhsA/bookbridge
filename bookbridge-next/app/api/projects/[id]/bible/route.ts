import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { requireProjectOwner } from '@/lib/project-auth'

// Bible scan status and style guide. Characters, places and aliases are
// glossary terms, served by /api/projects/[id]/glossary.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const guard = await requireProjectOwner(projectId, userId)
  if (!guard.ok) return guard.response

  const bible = await prisma.bookBible.findUnique({
    where: { projectId },
    select: { status: true, scanStatus: true, styleGuide: true, jobId: true, updatedAt: true },
  })
  return NextResponse.json({ bible }, { headers: { 'Cache-Control': 'no-store' } })
}

const patchSchema = z
  .object({
    styleGuide: z.string().max(5000).optional(),
    // Confirm after review, or reopen as a draft.
    status: z.enum(['CONFIRMED', 'DRAFT']).optional(),
  })
  .refine((b) => b.styleGuide !== undefined || b.status !== undefined)

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const guard = await requireProjectOwner(projectId, userId)
  if (!guard.ok) return guard.response

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = patchSchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const current = await prisma.bookBible.findUnique({
    where: { projectId },
    select: { status: true },
  })
  if (!current) return NextResponse.json({ error: 'No bible yet' }, { status: 404 })
  if (current.status === 'NONE') {
    return NextResponse.json({ error: 'Bible is not ready for review' }, { status: 409 })
  }

  const { styleGuide, status } = parsed.data
  const bible = await prisma.bookBible.update({
    where: { projectId },
    data: {
      ...(styleGuide !== undefined ? { styleGuide, styleGuideEdited: true } : {}),
      ...(status ? { status } : {}),
    },
    select: { status: true, styleGuide: true },
  })
  return NextResponse.json({ bible })
}
