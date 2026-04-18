import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { workerFetch } from '@/lib/worker'

const jobIdSchema = z.string().cuid()

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params

  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!jobIdSchema.safeParse(jobId).success) {
    return NextResponse.json({ error: 'Invalid job ID' }, { status: 400 })
  }

  const job = await prisma.translationJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      status: true,
      project: { select: { ownerId: true } },
    },
  })

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }
  if (job.project.ownerId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let workerRes: Response
  try {
    workerRes = await workerFetch(`/job/${jobId}`)
  } catch {
    return NextResponse.json({ error: 'Worker unavailable' }, { status: 502 })
  }

  let data: unknown
  try {
    data = await workerRes.json()
  } catch {
    data = { status: 'unknown' }
  }

  return NextResponse.json(data, { status: workerRes.status })
}
