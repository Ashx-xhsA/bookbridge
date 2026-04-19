import { NextRequest, NextResponse } from 'next/server'
import {
  getPublishedProjectWithChapters,
  tokenSchema,
} from '@/lib/public-project'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params

  const parsed = tokenSchema.safeParse(token)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const project = await getPublishedProjectWithChapters(parsed.data)
  if (!project) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 404 })
  }

  return NextResponse.json({
    data: {
      title: project.title,
      sourceLanguage: project.sourceLang,
      targetLanguage: project.targetLang,
      // Intentionally exposed so the reading view can render a progress badge
      // for projects still translating; no other workflow details are shared.
      status: project.status,
      chapters: project.chapters,
    },
  })
}
