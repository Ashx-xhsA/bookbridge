import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { rejectUnlessWorker } from '@/lib/worker-secret'

// Server-to-server: the Worker reports bible-scan progress after each step.
// The reply says whether to go on — a scan that was stopped or replaced by a
// newer one gets {continue: false}, and the Worker quits without a result.

const bodySchema = z
  .object({
    job_id: z.string().min(1).max(128),
    project_id: z.string().min(1).max(128),
    done: z.number().int().min(0),
    total: z.number().int().min(1).max(100_000),
  })
  .refine((b) => b.done <= b.total)

export async function POST(req: NextRequest) {
  const rejected = rejectUnlessWorker(req, 'bible-progress')
  if (rejected) return rejected

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid progress body' }, { status: 400 })
  }
  const { job_id, project_id, done, total } = parsed.data

  // Only the running scan of this job counts; one query both checks and writes.
  const { count } = await prisma.bookBible.updateMany({
    where: { projectId: project_id, jobId: job_id, scanStatus: 'SCANNING' },
    data: { scanDone: done, scanTotal: total, scanHeartbeatAt: new Date() },
  })
  return NextResponse.json({ continue: count > 0 })
}
