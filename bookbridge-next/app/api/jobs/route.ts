import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { projectId?: string; chapterId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { projectId, chapterId } = body
  if (!projectId) {
    return NextResponse.json(
      { error: 'projectId is required' },
      { status: 400 }
    )
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } })
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }
  if (project.ownerId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const job = await prisma.translationJob.create({
    data: {
      projectId,
      chapterId: chapterId || null,
      status: 'QUEUED',
    },
  })

  try {
    const workerUrl = process.env.WORKER_URL || 'http://localhost:8000'
    await fetch(`${workerUrl}/translate/chunk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        chunk_id: chapterId || '1',
      }),
    })
  } catch {
    // Worker may be unavailable — job stays QUEUED
  }

  return NextResponse.json(
    { id: job.id, status: job.status },
    { status: 201 }
  )
}
