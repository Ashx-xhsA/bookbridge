import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { workerFetch } from '@/lib/worker'
import { getUserLLMCredentials } from '@/lib/llm-credentials'

interface ExtractedTerm {
  english: string
  translation: string | null
  category: string
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const llmCreds = await getUserLLMCredentials(userId)
  if (!llmCreds) {
    return NextResponse.json(
      { error: 'No LLM API key available. Please add your API key in Settings to use glossary extraction.' },
      { status: 402 }
    )
  }

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      chapters: { orderBy: { number: 'asc' }, select: { sourceContent: true } },
      glossary: { select: { english: true } },
    },
  })

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }
  if (project.ownerId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const sourceText = project.chapters
    .map((c) => c.sourceContent || '')
    .join('\n\n')
    .slice(0, 12000)

  if (!sourceText.trim()) {
    return NextResponse.json({ error: 'No source content to extract from' }, { status: 400 })
  }

  const existingTerms = new Set(
    project.glossary.map((g) => g.english.toLowerCase())
  )

  try {
    const workerRes = await workerFetch('/glossary/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: sourceText,
        target_lang: project.targetLang,
        llm: llmCreds,
      }),
      timeoutMs: 60_000,
    })

    if (!workerRes.ok) {
      return NextResponse.json(
        { error: 'Glossary extraction failed' },
        { status: 502 }
      )
    }

    const data = (await workerRes.json()) as { terms: ExtractedTerm[] }
    const newTerms = data.terms.filter(
      (t) => !existingTerms.has(t.english.toLowerCase())
    )

    if (newTerms.length > 0) {
      await prisma.glossaryTerm.createMany({
        data: newTerms.map((t) => ({
          projectId: id,
          english: t.english,
          translation: t.translation,
          category: t.category || 'general',
        })),
      })
    }

    return NextResponse.json({
      extracted: newTerms.length,
      skipped: data.terms.length - newTerms.length,
      terms: newTerms,
    })
  } catch {
    return NextResponse.json(
      { error: 'Glossary extraction failed' },
      { status: 502 }
    )
  }
}
