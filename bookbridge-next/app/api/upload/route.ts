import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { workerFetch } from '@/lib/worker'

const POLL_INTERVAL_MS = 500
const POLL_MAX_ATTEMPTS = 60

interface WorkerChunk {
  chunk_id: number
  title: string
  start_page: number
  end_page: number
  page_count: number
}

interface WorkerJobStatus {
  job_id?: string
  status: string
  error?: string | null
  chunks?: WorkerChunk[]
}

async function pollJobUntilDone(workerJobId: string): Promise<WorkerJobStatus | null> {
  for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
    let res: Response
    try {
      res = await workerFetch(`/job/${workerJobId}`)
    } catch {
      return null
    }
    if (!res.ok) return null
    const data = (await res.json()) as WorkerJobStatus
    if (data.status === 'completed' || data.status === 'failed') return data
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }
  return null
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const title = (formData.get('title') as string) || 'Untitled'
  const targetLang = (formData.get('targetLang') as string) || 'zh-Hans'

  if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json(
      { error: 'A PDF file is required.' },
      { status: 400 }
    )
  }

  await prisma.user.upsert({
    where: { clerkId: userId },
    update: {},
    create: { clerkId: userId, email: `${userId}@placeholder.local` },
  })

  const project = await prisma.project.create({
    data: {
      title,
      sourceFile: file.name,
      targetLang,
      ownerId: userId,
      status: 'PARSING',
    },
  })

  const workerForm = new FormData()
  workerForm.append('file', file)

  let workerJobId: string | null = null

  try {
    const workerRes = await workerFetch('/parse', { method: 'POST', body: workerForm })
    if (workerRes.ok) {
      const workerData = await workerRes.json()
      workerJobId = typeof workerData.job_id === 'string' ? workerData.job_id : null
    }
  } catch {
    // Worker unavailable — project stays PARSING; client can poll job status later
  }

  if (workerJobId) {
    const job = await prisma.translationJob.create({
      data: {
        projectId: project.id,
        status: 'QUEUED',
        workerId: workerJobId,
      },
    })

    const jobStatus = await pollJobUntilDone(workerJobId)

    if (jobStatus?.status === 'completed' && Array.isArray(jobStatus.chunks)) {
      for (const ch of jobStatus.chunks) {
        await prisma.chapter.create({
          data: {
            projectId: project.id,
            number: ch.chunk_id,
            title: ch.title,
            startPage: ch.start_page,
            endPage: ch.end_page,
            pageCount: ch.page_count,
          },
        })
      }
      await prisma.translationJob.update({
        where: { id: job.id },
        data: { status: 'COMPLETED' },
      })
    } else if (jobStatus?.status === 'failed') {
      await prisma.translationJob.update({
        where: { id: job.id },
        data: { status: 'FAILED', error: jobStatus.error ?? 'Worker failed' },
      })
    }
  }

  await prisma.project.update({
    where: { id: project.id },
    data: { status: 'READY' },
  })

  return NextResponse.json({ projectId: project.id })
}
