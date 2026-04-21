import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'

const patchBodySchema = z.object({
  translation: z.string().optional(),
  approved: z.boolean().optional(),
  category: z.string().optional(),
})

type RouteParams = { params: Promise<{ id: string; termId: string }> }

async function requireOwnedProject(id: string, userId: string | null) {
  if (!userId) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const project = await prisma.project.findUnique({ where: { id } })
  if (!project) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  if (project.ownerId !== userId)
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { project }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { id, termId } = await params
  const { userId } = await auth()

  const gate = await requireOwnedProject(id, userId)
  if (gate.error) return gate.error

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = patchBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const term = await prisma.glossaryTerm.findUnique({ where: { id: termId } })
  if (!term || term.projectId !== id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const data: {
    translation?: string
    approved?: boolean
    category?: string
    userEdited?: boolean
  } = {}
  if (parsed.data.translation !== undefined) {
    data.translation = parsed.data.translation
    data.userEdited = true
  }
  if (parsed.data.approved !== undefined) data.approved = parsed.data.approved
  if (parsed.data.category !== undefined) data.category = parsed.data.category

  const updated = await prisma.glossaryTerm.update({
    where: { id: termId },
    data,
  })

  return NextResponse.json({ data: updated })
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { id, termId } = await params
  const { userId } = await auth()

  const gate = await requireOwnedProject(id, userId)
  if (gate.error) return gate.error

  const term = await prisma.glossaryTerm.findUnique({ where: { id: termId } })
  if (!term || term.projectId !== id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.glossaryTerm.delete({ where: { id: termId } })
  return new NextResponse(null, { status: 204 })
}
