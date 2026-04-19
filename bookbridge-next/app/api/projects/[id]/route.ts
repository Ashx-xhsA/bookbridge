import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@/app/generated/prisma/client'
import prisma from '@/lib/prisma'
import { requireProjectOwner } from '@/lib/project-auth'

function isRecordNotFound(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025'
}

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

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const isPublishAttempt =
    raw !== null && typeof raw === 'object' && 'isPublic' in raw

  const guard = await requireProjectOwner(id, userId)
  if (!guard.ok) {
    if (isPublishAttempt && guard.response.status === 403) {
      return NextResponse.json(
        { error: 'Forbidden', publicUrl: null },
        { status: 403 },
      )
    }
    return guard.response
  }

  const parsed = patchSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Invalid request body',
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    )
  }

  const data: Prisma.ProjectUpdateInput = {}
  if (parsed.data.name !== undefined) data.title = parsed.data.name
  if (parsed.data.targetLanguage !== undefined) data.targetLang = parsed.data.targetLanguage
  if (parsed.data.isPublic !== undefined) {
    // Rotate the token on every publish so previously-shared links are invalidated.
    data.isPublic = parsed.data.isPublic
    data.publicToken = parsed.data.isPublic ? crypto.randomUUID() : null
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: 'At least one updatable field is required' },
      { status: 400 },
    )
  }

  try {
    const updated = await prisma.project.update({ where: { id }, data })
    return NextResponse.json({ data: updated })
  } catch (err) {
    // TOCTOU: project may be deleted between the guard's findUnique and this update.
    if (isRecordNotFound(err)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    throw err
  }
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

  try {
    await prisma.project.delete({ where: { id } })
  } catch (err) {
    if (isRecordNotFound(err)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    throw err
  }
  return new NextResponse(null, { status: 204 })
}
