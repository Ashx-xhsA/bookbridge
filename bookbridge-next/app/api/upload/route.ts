import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { workerFetch } from '@/lib/worker'

// /parse unzips and walks every document of the EPUB; a large book on a cold
// worker can take tens of seconds. Lift the route budget so the platform
// doesn't kill us before the worker responds. maxDuration is a no-op on local
// dev and on Vercel hobby (capped at 10s) but required for Pro.
export const maxDuration = 60
const PARSE_TIMEOUT_MS = 55_000
const ACCEPTED_EXTENSIONS = ['.epub', '.txt']

// The worker is trusted, but its output is still validated before it is
// written to the DB so a malformed response fails loudly instead of creating
// half-populated chapters.
const workerParseSchema = z.object({
  job_id: z.string(),
  status: z.string(),
  chapters: z.array(
    z.object({
      number: z.number().int(),
      title: z.string(),
      paragraphs: z.array(z.string()),
    })
  ),
})
type WorkerParseResponse = z.infer<typeof workerParseSchema>

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const title = (formData.get('title') as string) || 'Untitled'
  const targetLang = (formData.get('targetLang') as string) || 'zh-Hans'

  const fileName = file?.name?.toLowerCase() ?? ''
  if (!file || !ACCEPTED_EXTENSIONS.some((ext) => fileName.endsWith(ext))) {
    return NextResponse.json(
      { error: 'An EPUB or TXT file is required.' },
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

  let parseData: WorkerParseResponse | null = null
  let workerErrorDetail: string | null = null
  let workerErrorStatus: number | null = null

  try {
    const workerRes = await workerFetch('/parse', {
      method: 'POST',
      body: workerForm,
      timeoutMs: PARSE_TIMEOUT_MS,
    })
    if (workerRes.ok) {
      const parsed = workerParseSchema.safeParse(await workerRes.json())
      if (parsed.success) {
        parseData = parsed.data
      } else {
        workerErrorDetail = 'Worker returned an invalid response'
      }
    } else {
      workerErrorStatus = workerRes.status
      try {
        const errJson = await workerRes.json()
        workerErrorDetail =
          typeof errJson?.detail === 'string' ? errJson.detail : 'Worker error'
      } catch {
        workerErrorDetail = 'Worker error'
      }
    }
  } catch (err) {
    workerErrorDetail = err instanceof Error ? err.message : 'Worker unavailable'
  }

  const chapters = parseData?.chapters ?? []

  if (chapters.length > 0 && parseData) {
    await prisma.$transaction([
      ...chapters.map((ch) =>
        prisma.chapter.create({
          data: {
            projectId: project.id,
            number: ch.number,
            title: ch.title,
            segments: {
              createMany: {
                data: ch.paragraphs.map((source, index) => ({ index, source })),
              },
            },
          },
        })
      ),
      prisma.translationJob.create({
        data: {
          projectId: project.id,
          status: 'COMPLETED',
          workerId: parseData.job_id,
        },
      }),
      prisma.project.update({
        where: { id: project.id },
        data: { status: 'READY' },
      }),
    ])
    return NextResponse.json({ projectId: project.id })
  }

  const errorMessage = workerErrorDetail ?? 'Worker returned no chapters'
  await prisma.$transaction([
    prisma.translationJob.create({
      data: {
        projectId: project.id,
        status: 'FAILED',
        workerId: parseData?.job_id ?? null,
        error: errorMessage,
      },
    }),
    prisma.project.update({
      where: { id: project.id },
      data: { status: 'DRAFT' },
    }),
  ])

  const clientStatus = workerErrorStatus === 422 || workerErrorStatus === 413 ? workerErrorStatus : 502
  return NextResponse.json(
    { projectId: project.id, error: errorMessage },
    { status: clientStatus }
  )
}
