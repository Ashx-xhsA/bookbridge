import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse, after } from 'next/server'
import prisma from '@/lib/prisma'
import { requireProjectOwner } from '@/lib/project-auth'
import { getUserLLMCredentials } from '@/lib/llm-credentials'
import { SEGMENT_SOURCES } from '@/lib/segments'
import { workerFetch } from '@/lib/worker'

// A scan this old without a callback is assumed lost and may be restarted.
const STALE_SCAN_MS = 30 * 60 * 1000

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
    select: { status: true, updatedAt: true },
  })
  if (
    existing?.status === 'SCANNING' &&
    Date.now() - new Date(existing.updatedAt).getTime() < STALE_SCAN_MS
  ) {
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
  await prisma.bookBible.upsert({
    where: { projectId },
    create: { projectId, status: 'SCANNING', jobId: job.id },
    update: { status: 'SCANNING', jobId: job.id },
  })

  // See api/jobs: after() keeps the dispatch inside the request lifecycle.
  after(async () => {
    try {
      await workerFetch('/bible/scan/async', {
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
    } catch (err) {
      console.error('[bible/scan] worker dispatch failed', { jobId: job.id, err: String(err) })
      try {
        await prisma.translationJob.update({
          where: { id: job.id },
          data: { status: 'FAILED', error: 'Worker unavailable' },
        })
        await prisma.bookBible.update({ where: { projectId }, data: { status: 'FAILED' } })
      } catch {
        // best-effort — the stale-scan window lets the user retry
      }
    }
  })

  return NextResponse.json({ id: job.id, status: 'PENDING' }, { status: 202 })
}
