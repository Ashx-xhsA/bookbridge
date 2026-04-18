import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { workerFetch } from '@/lib/worker'

const jobIdSchema = z.string().cuid()

// Zod schema matching Worker GET /job/{id} response (API_DESIGN.md)
const workerStatusSchema = z.object({
  job_id: z.string().optional(),
  status: z.string(),
  error: z.string().nullable().optional(),
})

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { jobId } = await params

  if (!jobIdSchema.safeParse(jobId).success) {
    return NextResponse.json({ error: 'Invalid job ID' }, { status: 400 })
  }

  const job = await prisma.translationJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      status: true,
      workerId: true,
      project: { select: { ownerId: true } },
    },
  })

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }
  if (job.project.ownerId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Worker not dispatched yet — return DB status directly
  if (!job.workerId) {
    return NextResponse.json(
      { job_id: jobId, status: job.status, error: null },
      { headers: NO_STORE }
    )
  }

  let workerRes: Response
  try {
    workerRes = await workerFetch(`/job/${job.workerId}`)
  } catch {
    return NextResponse.json({ error: 'Worker unavailable' }, { status: 502 })
  }

  // Worker returned a non-2xx — don't leak its body
  if (!workerRes.ok) {
    return NextResponse.json(
      { job_id: jobId, status: 'unknown', error: 'Worker reported an error' },
      { status: workerRes.status >= 500 ? 502 : workerRes.status, headers: NO_STORE }
    )
  }

  let raw: unknown
  try {
    raw = await workerRes.json()
  } catch {
    return NextResponse.json(
      { job_id: jobId, status: job.status, error: null },
      { headers: NO_STORE }
    )
  }

  const safe = workerStatusSchema.safeParse(raw)
  const data = safe.success ? safe.data : { job_id: jobId, status: job.status, error: null }

  return NextResponse.json(data, { headers: NO_STORE })
}
