import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { workerFetch } from '@/lib/worker'

const bodySchema = z.object({
  projectId: z.string().cuid(),
  chapterId: z.string().cuid(),
})

const workerResponseSchema = z.object({
  translation: z.string(),
})

const ACTIVE_JOB_STATUSES = ['QUEUED', 'PROCESSING', 'COMPLETED'] as const

async function markJobFailed(jobId: string, error: string): Promise<void> {
  try {
    await prisma.translationJob.update({
      where: { id: jobId },
      data: { status: 'FAILED', error },
    })
  } catch (dbErr) {
    console.error('[api/jobs] failed to mark job FAILED', { jobId, error, dbErr })
  }
}

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
    data: { projectId, chapterId, status: 'QUEUED' },
  })

  if (!chapter.sourceContent?.trim()) {
    await markJobFailed(job.id, 'No source content to translate')
    return NextResponse.json(
      { id: job.id, status: 'FAILED', error: 'No source content to translate' },
      { status: 400 }
    )
  }

  let workerRes: Response
  try {
    workerRes = await workerFetch('/translate/chunk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_text: chapter.sourceContent,
        target_lang: project.targetLang,
      }),
    })
  } catch {
    await markJobFailed(job.id, 'Worker unavailable')
    return NextResponse.json(
      { id: job.id, status: 'FAILED', error: 'Worker unavailable' },
      { status: 502 }
    )
  }

  if (!workerRes.ok) {
    await markJobFailed(job.id, 'Translation provider failed')
    return NextResponse.json(
      { id: job.id, status: 'FAILED', error: 'Translation provider failed' },
      { status: 502 }
    )
  }

  let workerData: unknown
  try {
    workerData = await workerRes.json()
  } catch {
    await markJobFailed(job.id, 'Invalid worker response')
    return NextResponse.json(
      { id: job.id, status: 'FAILED', error: 'Invalid worker response' },
      { status: 502 }
    )
  }

  const safe = workerResponseSchema.safeParse(workerData)
  if (!safe.success) {
    await markJobFailed(job.id, 'Invalid worker response')
    return NextResponse.json(
      { id: job.id, status: 'FAILED', error: 'Invalid worker response' },
      { status: 502 }
    )
  }

  const updatedJob = await prisma.$transaction(async (tx) => {
    await tx.chapter.update({
      where: { id: chapter.id },
      data: { translation: safe.data.translation },
    })
    return tx.translationJob.update({
      where: { id: job.id },
      data: { status: 'COMPLETED' },
      select: { id: true, status: true },
    })
  })

  return NextResponse.json({ id: updatedJob.id, status: updatedJob.status }, { status: 200 })
}
