import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { workerFetch } from '@/lib/worker'
import { getUserLLMCredentials } from '@/lib/llm-credentials'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const project = await prisma.project.findUnique({
    where: { id },
    include: { chapters: { orderBy: { number: 'asc' } } },
  })

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }
  if (project.ownerId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const chaptersToSummarize = project.chapters.filter(
    (c) => c.sourceContent && !c.summary
  )

  if (chaptersToSummarize.length === 0) {
    return NextResponse.json({ message: 'All chapters already have summaries', count: 0 })
  }

  const llmCreds = await getUserLLMCredentials(userId)

  const results: { chapterId: string; summary: string }[] = []

  for (const chapter of chaptersToSummarize) {
    try {
      const workerRes = await workerFetch('/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: chapter.sourceContent!.slice(0, 8000),
          max_words: 100,
          llm: llmCreds,
        }),
        timeoutMs: 30_000,
      })

      if (workerRes.ok) {
        const data = (await workerRes.json()) as { summary: string }
        await prisma.chapter.update({
          where: { id: chapter.id },
          data: { summary: data.summary },
        })
        results.push({ chapterId: chapter.id, summary: data.summary })
      }
    } catch {
      // Skip chapters that fail — best effort
    }
  }

  return NextResponse.json({
    message: `Generated ${results.length} summaries`,
    count: results.length,
    results,
  })
}
