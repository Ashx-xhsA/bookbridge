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
      select: { id: true, chapterId: true },
    })
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }
    // One atomic batch with the job status written last: the poller must
    // never observe a terminal job whose segments are not yet stored.
    await prisma.$transaction([
      ...(job.chapterId ? segmentWrites(job.chapterId, payload) : []),
      prisma.translationJob.update({
        where: { id: payload.job_id },
        data:
          payload.status === 'SUCCEEDED'
            ? { status: 'SUCCEEDED', error: null }
            : { status: 'FAILED', error: payload.error ?? 'Translation failed' },
      }),
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
