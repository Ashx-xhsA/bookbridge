import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { Prisma } from '@/app/generated/prisma/client'
import prisma from '@/lib/prisma'
import { rejectUnlessWorker } from '@/lib/worker-secret'

// Server-to-server endpoint. The Python Worker POSTs here with the result of
// a background /translate/segments/async job. We verify a shared secret in
// X-Worker-Secret and then persist per-segment results so the BFF poller can
// see them. No user auth — Clerk is not in this path.

const segmentResult = z.object({
  index: z.number().int().min(0),
  translation: z.string().min(1),
})

const results = {
  segments: z.array(segmentResult).max(5000).default([]),
  failed_indices: z.array(z.number().int().min(0)).max(5000).default([]),
  summary: z.string().optional(),
}

const bodySchema = z.discriminatedUnion('status', [
  // Progress after each batch: stores those segments and doubles as the
  // heartbeat the jobs route uses to tell a slow job from a dead one.
  z.object({
    job_id: z.string().min(1).max(128),
    status: z.literal('RUNNING'),
    ...results,
  }),
  z.object({
    job_id: z.string().min(1).max(128),
    status: z.literal('SUCCEEDED'),
    ...results,
  }),
  z.object({
    job_id: z.string().min(1).max(128),
    status: z.literal('FAILED'),
    error: z.string().max(500).optional(),
    ...results,
  }),
])

type CallbackBody = z.infer<typeof bodySchema>

// Large chapters mean many segment writes in one transaction.
export const maxDuration = 60

const ACTIVE = new Set(['PENDING', 'RUNNING'])

function jobUpdate(payload: CallbackBody) {
  if (payload.status === 'RUNNING') return { status: 'RUNNING' as const }
  if (payload.status === 'SUCCEEDED') return { status: 'SUCCEEDED' as const, error: null }
  return { status: 'FAILED' as const, error: payload.error ?? 'Translation failed' }
}

export async function POST(req: NextRequest) {
  const rejected = rejectUnlessWorker(req, 'worker-callback')
  if (rejected) return rejected

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid callback body' }, { status: 400 })
  }

  const payload = parsed.data

  try {
    const job = await prisma.translationJob.findUnique({
      where: { id: payload.job_id },
      select: { id: true, chapterId: true, status: true },
    })
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }
    // A job already finished (or replaced as stale) must not be overwritten
    // by a Worker run that kept going in the background.
    if (!ACTIVE.has(job.status)) {
      return NextResponse.json({ error: 'Job is no longer active' }, { status: 409 })
    }
    // One atomic batch with the job status written last: the poller must
    // never observe a terminal job whose segments are not yet stored.
    await prisma.$transaction([
      ...(job.chapterId ? segmentWrites(job.chapterId, payload) : []),
      prisma.translationJob.update({ where: { id: payload.job_id }, data: jobUpdate(payload) }),
    ])
  } catch (err) {
    if ((err as { code?: string })?.code === 'P2025') {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }
    console.error('[worker-callback] failed to update job', {
      jobId: payload.job_id,
      err: String(err),
    })
    return NextResponse.json({ error: 'Failed to update job' }, { status: 500 })
  }

  return NextResponse.json({ ok: true }, { status: 200 })
}

function segmentWrites(
  chapterId: string,
  payload: CallbackBody
): Prisma.PrismaPromise<unknown>[] {
  const writes: Prisma.PrismaPromise<unknown>[] = payload.segments.map((seg) =>
    prisma.segment.updateMany({
      where: { chapterId, index: seg.index },
      data: { translation: seg.translation, status: 'translated' },
    })
  )
  if (payload.failed_indices.length > 0) {
    writes.push(
      prisma.segment.updateMany({
        where: { chapterId, index: { in: payload.failed_indices } },
        data: { status: 'failed' },
      })
    )
  }
  if (payload.summary) {
    writes.push(
      prisma.chapter.update({ where: { id: chapterId }, data: { summary: payload.summary } })
    )
  }
  return writes
}
