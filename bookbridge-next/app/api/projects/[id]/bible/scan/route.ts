import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse, after } from 'next/server'
import prisma from '@/lib/prisma'
import { requireProjectOwner } from '@/lib/project-auth'
import { getUserLLMCredentials } from '@/lib/llm-credentials'
import { SEGMENT_SOURCES } from '@/lib/segments'
import { workerFetch } from '@/lib/worker'
import { isScanLost } from '@/lib/bible-scan'


// Starts the whole-book pre-scan that drafts the book bible. Returns a
// TranslationJob id the client polls via /api/jobs/[id]; the Worker posts
// the result to /api/internal/worker-callback/bible.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const guard = await requireProjectOwner(projectId, userId)
  if (!guard.ok) return guard.response

  const existing = await prisma.bookBible.findUnique({
    where: { projectId },
    select: { scanStatus: true, scanStartedAt: true, scanHeartbeatAt: true },
  })
  // A running scan keeps reporting progress; one that went silent is lost
  // (e.g. the Worker restarted) and may be replaced.
  if (existing?.scanStatus === 'SCANNING' && !isScanLost(existing)) {
    return NextResponse.json({ error: 'A scan is already running' }, { status: 409 })
  }

  const llmCreds = await getUserLLMCredentials(userId)
  if (!llmCreds) {
    return NextResponse.json(
      { error: 'An API key is required to scan the book. Add yours in Settings.' },
      { status: 402 }
    )
  }

  const [project, chapterRows] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { targetLang: true } }),
    prisma.chapter.findMany({
      where: { projectId },
      orderBy: { number: 'asc' },
      select: { segments: SEGMENT_SOURCES },
    }),
  ])
  const chapters = chapterRows
    .map((c) => c.segments.map((s) => s.source).filter((s) => s.trim()))
    .filter((paragraphs) => paragraphs.length > 0)
  if (chapters.length === 0) {
    return NextResponse.json({ error: 'No text to scan' }, { status: 400 })
  }

  const job = await prisma.translationJob.create({
    data: { projectId, status: 'PENDING' },
    select: { id: true, status: true },
  })
  // Only the scan state changes: an existing bible stays in use (and keeps
  // its review status) until the new scan succeeds.
  const now = new Date()
  const running = {
    scanStatus: 'SCANNING' as const,
    scanStartedAt: now,
    scanHeartbeatAt: now,
    scanDone: 0,
    scanTotal: 0,
    jobId: job.id,
  }
  await prisma.bookBible.upsert({
    where: { projectId },
    create: { projectId, ...running },
    update: running,
  })

  // See api/jobs: after() keeps the dispatch inside the request lifecycle.
  after(async () => {
    try {
      const res = await workerFetch('/bible/scan/async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: job.id,
          project_id: projectId,
          target_lang: project?.targetLang,
          chapters,
          llm: llmCreds,
        }),
      })
      // workerFetch only throws on network errors; a 4xx/5xx must fail too.
      if (!res.ok) throw new Error(`Worker responded ${res.status}`)
    } catch (err) {
      console.error('[bible/scan] worker dispatch failed', { jobId: job.id, err: String(err) })
      try {
        await prisma.translationJob.update({
          where: { id: job.id },
          data: { status: 'FAILED', error: 'Worker unavailable' },
        })
        await prisma.bookBible.update({ where: { projectId }, data: { scanStatus: 'FAILED' } })
      } catch {
        // best-effort — the stale-scan window lets the user retry
      }
    }
  })

  return NextResponse.json({ id: job.id, status: 'PENDING' }, { status: 202 })
}

// Stops a running scan. The Worker learns on its next progress report (at
// most one passage later) and quits; any late result for the old job is
// refused because jobId no longer matches. The current bible stays as it is.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const guard = await requireProjectOwner(projectId, userId)
  if (!guard.ok) return guard.response

  const bible = await prisma.bookBible.findUnique({
    where: { projectId },
    select: { scanStatus: true, jobId: true },
  })
  if (bible?.scanStatus !== 'SCANNING') {
    return NextResponse.json({ error: 'No scan is running' }, { status: 409 })
  }

  await prisma.$transaction([
    prisma.bookBible.update({
      where: { projectId },
      data: { scanStatus: 'IDLE', jobId: null, scanDone: 0, scanTotal: 0, scanHeartbeatAt: null },
    }),
    ...(bible.jobId
      ? [
          prisma.translationJob.update({
            where: { id: bible.jobId },
            data: { status: 'FAILED', error: 'Stopped by user' },
          }),
        ]
      : []),
  ])
  return NextResponse.json({ bible: { scanStatus: 'IDLE' } })
}
