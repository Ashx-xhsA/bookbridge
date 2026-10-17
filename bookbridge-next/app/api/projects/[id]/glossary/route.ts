import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { aliasLinkError } from '@/lib/glossary-alias'

const createSchema = z.object({
  english: z.string().trim().min(1).max(200),
  translation: z.string().max(500).optional(),
  category: z.string().min(1).max(50).optional(),
  // Create the term as an alias of this main term (own translation).
  aliasOfId: z.string().min(1).max(128).optional(),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const project = await prisma.project.findUnique({ where: { id } })
  if (!project) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (project.ownerId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const terms = await prisma.glossaryTerm.findMany({
    where: { projectId: id },
    orderBy: { english: 'asc' },
  })

  return NextResponse.json({ data: terms })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const project = await prisma.project.findUnique({ where: { id } })
  if (!project) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (project.ownerId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = createSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'english term is required' }, { status: 400 })
  }
  const { english, translation, category, aliasOfId } = parsed.data

  if (aliasOfId) {
    const linkError = await aliasLinkError(id, null, aliasOfId)
    if (linkError) return NextResponse.json({ error: linkError }, { status: 400 })
  }

  const term = await prisma.glossaryTerm.create({
    data: {
      projectId: id,
      english,
      translation: translation || null,
      category: category || 'general',
      // A user-added alias is reviewed by definition; a re-scan keeps it.
      ...(aliasOfId ? { aliasOfId, userEdited: true } : {}),
    },
  })

  return NextResponse.json({ data: term }, { status: 201 })
}
