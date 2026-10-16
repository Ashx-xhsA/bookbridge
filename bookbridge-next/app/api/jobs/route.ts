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

// Paragraphs from before this chapter that seed the Worker's rolling context
// window. The Worker trims to its configured window (max 10).
const PRECEDING_SEGMENTS = 10

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
    select: {
      id: true,
      projectId: true,
      number: true,
      segments: { select: { index: true, source: true }, orderBy: { index: 'asc' } },
    },
  })
  if (!chapter || chapter.projectId !== projectId) {
    return NextResponse.json({ error: 'Chapter not found' }, { status: 404 })
  }

  const segments = chapter.segments.filter((s) => s.source.trim())
  if (segments.length === 0) {
    return NextResponse.json(
      { error: 'No source content to translate' },
      { status: 400 }
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

  // The full glossary goes to the Worker, which picks the terms (or aliases)
  // that occur in each batch. The tail of the previous chapter seeds the
  // context window — newest-first so `take` keeps the closest paragraphs.
  const [precedingRows, glossaryRows] = await Promise.all([
    prisma.segment.findMany({
      where: { chapter: { projectId, number: { lt: chapter.number } } },
      orderBy: [{ chapter: { number: 'desc' } }, { index: 'desc' }],
      take: PRECEDING_SEGMENTS,
      select: { source: true, translation: true },
    }),
    prisma.glossaryTerm.findMany({
      where: { projectId },
      select: {
        english: true,
        translation: true,
        category: true,
        approved: true,
        aliases: true,
      },
    }),
  ])

  const preceding = precedingRows.reverse()

  const glossary = glossaryRows
    .filter((t): t is typeof t & { translation: string } => !!t.translation)
    .map((t) => ({
      english: t.english,
      translation: t.translation,
      category: t.category,
      approved: t.approved,
      aliases: t.aliases ?? [],
    }))

  const llmCreds = await getUserLLMCredentials(userId)
  if (!llmCreds) {
    return NextResponse.json(
      { error: 'An API key is required to translate. Add yours in Settings.' },
      { status: 402 }
    )
  }

  const job = await prisma.translationJob.create({
    data: { projectId, chapterId, status: 'PENDING' },
    select: { id: true, status: true },
  })

  // Dispatch via next/server `after()` so the Worker call + FAILED-marking
  // Prisma write run inside the request's managed post-response lifecycle.
  // A plain `void fetch(...).catch(...)` race-loses on Vercel, where the
  // Lambda context is frozen the instant the response is sent — the `.catch`
  // handler may never run, leaving failed-dispatch jobs stuck in PENDING.
  after(async () => {
    try {
      await workerFetch('/translate/segments/async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: job.id,
          segments,
          preceding,
          target_lang: project.targetLang,
          project_id: projectId,
          llm: llmCreds,
          ...(glossary.length > 0 ? { glossary } : {}),
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
