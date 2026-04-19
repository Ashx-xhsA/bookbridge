import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { requireProjectOwner } from '@/lib/project-auth'

const patchSchema = z
  .object({
    name: z.string().min(1).optional(),
    targetLanguage: z.string().min(1).optional(),
    isPublic: z.boolean().optional(),
  })
  .strict()

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
    include: {
      chapters: { orderBy: { number: 'asc' } },
      jobs: true,
      glossary: true,
    },
  })

  if (!project) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (project.ownerId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json({ data: project })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const guard = await requireProjectOwner(id, userId)
  if (!guard.ok) return guard.response

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const data: { title?: string; targetLang?: string; isPublic?: boolean } = {}
  if (parsed.data.name !== undefined) data.title = parsed.data.name
  if (parsed.data.targetLanguage !== undefined) data.targetLang = parsed.data.targetLanguage
  if (parsed.data.isPublic !== undefined) data.isPublic = parsed.data.isPublic

  const updated = await prisma.project.update({ where: { id }, data })
  return NextResponse.json(updated)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const guard = await requireProjectOwner(id, userId)
  if (!guard.ok) return guard.response

  await prisma.project.delete({ where: { id } })
  return new NextResponse(null, { status: 204 })
}
