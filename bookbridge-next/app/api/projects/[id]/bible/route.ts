import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
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
    select: { status: true, styleGuide: true, jobId: true, updatedAt: true },
  })
  return NextResponse.json({ bible }, { headers: { 'Cache-Control': 'no-store' } })
}
