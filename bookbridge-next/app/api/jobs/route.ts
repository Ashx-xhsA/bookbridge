import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { workerFetch } from '@/lib/worker'

const bodySchema = z.object({
  projectId: z.string().cuid(),
  chapterId: z.string().optional(),
})

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

  const project = await prisma.project.findUnique({ where: { id: projectId } })
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }
  if (project.ownerId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const job = await prisma.translationJob.create({
    data: { projectId, chapterId: chapterId || null, status: 'QUEUED' },
  })

  // Dispatch to Worker stub — harness wired in S3; store workerId for polling
  try {
    const workerRes = await workerFetch('/translate/chunk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId, chunk_id: chapterId || job.id }),
    })
    if (workerRes.ok) {
      const workerData = await workerRes.json()
      if (workerData.job_id) {
        await prisma.translationJob.update({
          where: { id: job.id },
          data: { workerId: workerData.job_id },
        })
      }
    }
  } catch {
    // Worker unavailable — job stays QUEUED with null workerId
  }

  return NextResponse.json({ id: job.id, status: job.status }, { status: 201 })
}
