import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse, after } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { workerFetch } from '@/lib/worker'

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
    select: { id: true, sourceContent: true, projectId: true },
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

  const existingJob = await prisma.translationJob.findFirst({
    where: { chapterId, status: { in: [...ACTIVE_JOB_STATUSES] } },
    select: { id: true, status: true },
  })
  if (existingJob) {
    return NextResponse.json(
      { id: existingJob.id, status: existingJob.status, error: 'Job already exists for this chapter' },
      { status: 409 }
    )
  }

  const job = await prisma.translationJob.create({
    data: { projectId, chapterId, status: 'PENDING' },
    select: { id: true, status: true },
  })

  // Fetch the project glossary so the Worker can inject it into the prompt
  // and the LLM keeps proper-noun translations consistent across chapters.
  // Empty result → omit the field entirely rather than sending an empty
  // array (keeps the Worker payload lean and the Worker treats
  // null/undefined as "no injection").
  const glossaryRows = await prisma.glossaryTerm.findMany({
    where: { projectId },
    select: {
      english: true,
      translation: true,
      category: true,
      approved: true,
    },
  })
  const glossary = glossaryRows
    .filter((t): t is typeof t & { translation: string } => !!t.translation)
    .map((t) => ({
      english: t.english,
      translation: t.translation,
      category: t.category,
      approved: t.approved,
    }))

  // Dispatch via next/server `after()` so the Worker call + FAILED-marking
  // Prisma write run inside the request's managed post-response lifecycle.
  // A plain `void fetch(...).catch(...)` race-loses on Vercel, where the
  // Lambda context is frozen the instant the response is sent — the `.catch`
  // handler may never run, leaving failed-dispatch jobs stuck in PENDING.
  after(async () => {
    try {
      await workerFetch('/translate/chunk/async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: job.id,
          source_text: chapter.sourceContent,
          target_lang: project.targetLang,
          project_id: projectId,
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
