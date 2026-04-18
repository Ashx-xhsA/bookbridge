import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { workerFetch } from '@/lib/worker'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const job = await prisma.translationJob.findUnique({
    where: { id: jobId },
    include: { project: true },
  })

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }
  if (job.project.ownerId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const workerRes = await workerFetch(`/job/${jobId}`)
    const data = await workerRes.json()
    return NextResponse.json(data, { status: workerRes.status })
  } catch {
    return NextResponse.json({ error: 'Worker unavailable' }, { status: 502 })
  }
}
