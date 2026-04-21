import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse, after } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { workerFetch } from '@/lib/worker'
import { getUserLLMCredentials } from '@/lib/llm-credentials'

const bodySchema = z.object({
  projectId: z.string().cuid(),
  chapterId: z.string().cuid(),
})

// The check intentionally does not include SUCCEEDED — users may want to
// re-translate a chapter after reviewing the first pass (e.g. after adding
// glossary terms or fixing source text). Concurrent double-clicks from the
// UI are prevented by the disabled state on the Translate button during
// polling, so a fresh POST can only land once the previous job is terminal.
const ACTIVE_JOB_STATUSES = ['PENDING', 'RUNNING'] as const

export async function POST(req: NextRequest) {
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

  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { projectId, chapterId } = parsed.data

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, ownerId: true, targetLang: true },
  })
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }
  if (project.ownerId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: { id: true, sourceContent: true, projectId: true, number: true },
  })
  if (!chapter || chapter.projectId !== projectId) {
    return NextResponse.json({ error: 'Chapter not found' }, { status: 404 })
  }

  if (!chapter.sourceContent?.trim()) {
    return NextResponse.json(
      { error: 'No source content to translate' },
      { status: 400 }
    )
  }

  const FREE_TIER_LIMIT = 2000
  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { apiKey: true, freeCharsUsed: true },
  })

  const charCount = chapter.sourceContent.length
  const usingFreeTier = !user?.apiKey
  if (usingFreeTier && (user?.freeCharsUsed ?? 0) + charCount > FREE_TIER_LIMIT) {
    return NextResponse.json(
      {
        error: `Free tier limit reached (${FREE_TIER_LIMIT.toLocaleString()} chars). Add your API key in Settings for unlimited translation.`,
        freeCharsUsed: user?.freeCharsUsed ?? 0,
        charCount,
      },
      { status: 402 }
    )
  }

  const STALE_THRESHOLD_MS = 5 * 60 * 1000
  const existingJob = await prisma.translationJob.findFirst({
    where: { chapterId, status: { in: [...ACTIVE_JOB_STATUSES] } },
    select: { id: true, status: true, createdAt: true },
  })
  if (existingJob) {
    const age = Date.now() - new Date(existingJob.createdAt).getTime()
    if (age < STALE_THRESHOLD_MS) {
      return NextResponse.json(
        { id: existingJob.id, status: existingJob.status, error: 'Translation is already in progress for this chapter' },
        { status: 409 }
      )
    }
    await prisma.translationJob.update({
      where: { id: existingJob.id },
      data: { status: 'FAILED', error: 'Timed out — retrying' },
    })
  }

  // Build context from adjacent chapter summaries + project glossary
  const [adjacentChapters, glossaryTerms] = await Promise.all([
    prisma.chapter.findMany({
      where: {
        projectId,
        number: { in: [chapter.number - 1, chapter.number + 1] },
      },
      select: { number: true, title: true, summary: true },
      orderBy: { number: 'asc' },
    }),
    prisma.glossaryTerm.findMany({
      where: { projectId },
      select: { english: true, translation: true },
      take: 50,
    }),
  ])

  const contextParts: string[] = []
  for (const adj of adjacentChapters) {
    if (adj.summary) {
      const label = adj.number < chapter.number ? 'Previous' : 'Next'
      contextParts.push(`${label} chapter "${adj.title}": ${adj.summary}`)
    }
  }
  if (glossaryTerms.length > 0) {
    const glossaryStr = glossaryTerms
      .filter((g) => g.translation)
      .map((g) => `${g.english} → ${g.translation}`)
      .join('; ')
    if (glossaryStr) contextParts.push(`Glossary: ${glossaryStr}`)
  }

  const context = contextParts.length > 0 ? contextParts.join('\n') : undefined
  const llmCreds = await getUserLLMCredentials(userId)

  const job = await prisma.translationJob.create({
    data: { projectId, chapterId, status: 'PENDING' },
    select: { id: true, status: true },
  })

  if (usingFreeTier) {
    await prisma.user.update({
      where: { clerkId: userId },
      data: { freeCharsUsed: { increment: charCount } },
    })
  }

  after(async () => {
    try {
      await workerFetch('/translate/chunk/async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: job.id,
          source_text: chapter.sourceContent,
          target_lang: project.targetLang,
          context,
          llm: llmCreds,
        }),
      })
    } catch (err) {
      console.error('[api/jobs] worker dispatch failed', {
        jobId: job.id,
        err: String(err),
      })
      try {
        await prisma.translationJob.update({
          where: { id: job.id },
          data: { status: 'FAILED', error: 'Worker unavailable' },
        })
      } catch {
        // best-effort — surface via poller on next GET
      }
    }
  })

  return NextResponse.json({ id: job.id, status: 'PENDING' }, { status: 202 })
}
