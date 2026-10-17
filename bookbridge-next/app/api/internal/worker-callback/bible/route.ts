import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { Prisma } from '@/app/generated/prisma/client'
import prisma from '@/lib/prisma'
import { planBibleMerge, termKey, type MergePlan } from '@/lib/bible-merge'
import { rejectUnlessWorker } from '@/lib/worker-secret'

// Server-to-server: the Worker posts a finished (or failed) book pre-scan.
// Entities merge into the glossary (user-owned translations are kept), the
// style guide is stored, and the poll job turns terminal last.

const name = z.string().trim().min(1).max(200)
const translation = z.string().trim().min(1).max(500)

const entitySchema = z.object({
  english: name,
  translation,
  category: z.string().min(1).max(50),
  notes: z.string().max(1000).nullable(),
  mentions: z.number().int().min(0),
  aliases: z.array(z.object({ english: name, translation })).max(50),
})

const ids = { job_id: z.string().min(1).max(128), project_id: z.string().min(1).max(128) }

const bodySchema = z.discriminatedUnion('status', [
  z.object({
    ...ids,
    status: z.literal('SUCCEEDED'),
    // Same cap as the Worker's translate request, so it can be sent back.
    style_guide: z.string().max(5000),
    entities: z.array(entitySchema).max(1000),
  }),
  z.object({ ...ids, status: z.literal('FAILED'), error: z.string().max(500).optional() }),
])

// Large books produce hundreds of writes; the default 5 s is too tight.
const MERGE_TIMEOUT_MS = 55_000
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const rejected = rejectUnlessWorker(req, 'bible-callback')
  if (rejected) return rejected

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid callback body' }, { status: 400 })
  }
  const payload = parsed.data
  const projectId = payload.project_id

  const bible = await prisma.bookBible.findUnique({
    where: { projectId },
    select: { jobId: true, styleGuideEdited: true },
  })
  if (!bible) return NextResponse.json({ error: 'Bible not found' }, { status: 404 })
  // A newer scan was started since; this result must not overwrite it.
  if (bible.jobId !== payload.job_id) {
    return NextResponse.json({ error: 'Superseded scan' }, { status: 409 })
  }

  try {
    if (payload.status === 'FAILED') {
      await prisma.$transaction([
        // The current bible stays in use; only the scan is marked failed.
        prisma.bookBible.update({ where: { projectId }, data: { scanStatus: 'FAILED' } }),
        prisma.translationJob.update({
          where: { id: payload.job_id },
          data: { status: 'FAILED', error: payload.error ?? 'Bible scan failed' },
        }),
      ])
    } else {
      const existing = await prisma.glossaryTerm.findMany({
        where: { projectId },
        select: {
          id: true, english: true, translation: true, approved: true, userEdited: true,
          notes: true, aliasOfId: true,
          _count: { select: { aliases: true } },
        },
      })
      const plan = planBibleMerge(
        existing.map(({ _count, ...t }) => ({ ...t, aliasCount: _count.aliases })),
        payload.entities
      )
      await prisma.$transaction(
        async (tx) => {
          await applyPlan(tx, projectId, plan, existing)
          await tx.bookBible.update({
            where: { projectId },
            data: {
              status: 'DRAFT',
              scanStatus: 'IDLE',
              // Never replace a user-edited or existing guide with an empty one.
              ...(!bible.styleGuideEdited && payload.style_guide.trim()
                ? { styleGuide: payload.style_guide }
                : {}),
            },
          })
          await tx.translationJob.update({
            where: { id: payload.job_id },
            data: { status: 'SUCCEEDED', error: null },
          })
        },
        { timeout: MERGE_TIMEOUT_MS }
      )
    }
  } catch (err) {
    console.error('[bible-callback] failed to store scan', { jobId: payload.job_id, err: String(err) })
    return NextResponse.json({ error: 'Failed to store bible' }, { status: 500 })
  }

  return NextResponse.json({ ok: true }, { status: 200 })
}

async function applyPlan(
  tx: Prisma.TransactionClient,
  projectId: string,
  plan: MergePlan,
  existing: { id: string; english: string }[]
) {
  const created = plan.creates.length
    ? await tx.glossaryTerm.createManyAndReturn({
        data: plan.creates.map((c) => ({ ...c, projectId })),
        select: { id: true, english: true },
      })
    : []
  for (const u of plan.updates) {
    await tx.glossaryTerm.update({ where: { id: u.id }, data: u.data })
  }
  const idOf = new Map([...existing, ...created].map((t) => [termKey(t.english), t.id]))
  const aliasesByMain = new Map<string, string[]>()
  for (const { alias, main } of plan.links) {
    const [aliasId, mainId] = [idOf.get(alias), idOf.get(main)]
    if (!aliasId || !mainId || aliasId === mainId) continue
    aliasesByMain.set(mainId, [...(aliasesByMain.get(mainId) ?? []), aliasId])
  }
  for (const [mainId, aliasIds] of aliasesByMain) {
    await tx.glossaryTerm.updateMany({
      where: { id: { in: aliasIds }, projectId },
      data: { aliasOfId: mainId },
    })
  }
}
