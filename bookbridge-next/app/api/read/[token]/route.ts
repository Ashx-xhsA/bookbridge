import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'

const tokenSchema = z.string().min(1)

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params

  const parsed = tokenSchema.safeParse(token)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  // Single query gates both existence and publish-state. Unknown token and
  // unpublished project both return null → identical 404 prevents enumeration.
  const project = await prisma.project.findFirst({
    where: { publicToken: parsed.data, isPublic: true },
    include: {
      chapters: {
        orderBy: { number: 'asc' },
        select: { id: true, number: true, title: true },
      },
    },
  })

  if (!project) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 404 })
  }

  return NextResponse.json({
    data: {
      title: project.title,
      sourceLanguage: project.sourceLang,
      targetLanguage: project.targetLang,
      status: project.status,
      chapters: project.chapters,
    },
  })
}
