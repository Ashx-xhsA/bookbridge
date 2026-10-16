import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { aliasLinkError } from '@/lib/glossary-alias'

// translation must be at least 1 char — an empty string almost always
// reflects a client mistake, and writing "" would silently flip userEdited
// to true, polluting the "unreviewed" signal the UI relies on.
const patchBodySchema = z.object({
  translation: z.string().min(1).max(500).optional(),
  approved: z.boolean().optional(),
  category: z.string().min(1).max(50).optional(),
  // Book-bible fields. Editing them marks the term user-owned so a re-scan
  // won't overwrite them.
  gender: z.enum(['male', 'female', 'unknown']).nullable().optional(),
  voice: z.string().max(1000).nullable().optional(),
  aliasOfId: z.string().min(1).max(128).nullable().optional(),
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

  const { translation, approved, category, gender, voice, aliasOfId } = parsed.data
  if (aliasOfId) {
    const linkError = await aliasLinkError(id, termId, aliasOfId)
    if (linkError) return NextResponse.json({ error: linkError }, { status: 400 })
  }

  const data: {
    translation?: string
    approved?: boolean
    category?: string
    gender?: string | null
    voice?: string | null
    aliasOfId?: string | null
    userEdited?: boolean
  } = {}
  if (translation !== undefined) data.translation = translation
  if (approved !== undefined) data.approved = approved
  if (category !== undefined) data.category = category
  if (gender !== undefined) data.gender = gender
  if (voice !== undefined) data.voice = voice
  if (aliasOfId !== undefined) data.aliasOfId = aliasOfId
  if (translation !== undefined || gender !== undefined || voice !== undefined) {
    data.userEdited = true
  }

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
