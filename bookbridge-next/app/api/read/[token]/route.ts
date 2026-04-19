import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getPublishedProject } from '@/lib/public-project'

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

  const project = await getPublishedProject(parsed.data)
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
