import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import prisma from '@/lib/prisma'

// Server-to-server endpoint. After each chunk translation, the Python Worker
// POSTs newly-extracted terms here (authenticated via WORKER_CALLBACK_SECRET).
// Merge rule: if a term with the same (projectId, case-insensitive english)
// already exists in the DB, skip it — extraction must never overwrite
// user-curated or previously-extracted rows.

const termSchema = z.object({
  english: z.string().min(1).max(200),
  translation: z.string().max(500).optional(),
  category: z.string().max(50).optional(),
})

const bodySchema = z.object({
  projectId: z.string().min(1).max(128),
  terms: z.array(termSchema).min(1).max(200),
})

function secretsEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

export async function POST(req: NextRequest) {
  const expected = process.env.WORKER_CALLBACK_SECRET
  if (!expected) {
    console.error('[glossary-callback] WORKER_CALLBACK_SECRET is not configured')
    return NextResponse.json(
      { error: 'Callback receiver not configured' },
      { status: 500 }
    )
  }

  const provided = req.headers.get('x-worker-secret') ?? ''
  if (!provided || !secretsEqual(provided, expected)) {
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
    return NextResponse.json({ error: 'Invalid callback body' }, { status: 400 })
  }

  const { projectId, terms } = parsed.data

  // Guard: avoid fk-violation 500s when the Worker references a stale or
  // unknown project id.
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  })
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  // Case-insensitive dedup: a term stored as "Hermione" must match an
  // incoming "hermione". Prisma's `in:` filter is case-sensitive on
  // Postgres text columns, so we build an OR of `equals + mode:insensitive`.
  const incomingEnglish = terms.map((t) => t.english)
  const existing = await prisma.glossaryTerm.findMany({
    where: {
      projectId,
      OR: incomingEnglish.map((e) => ({
        english: { equals: e, mode: 'insensitive' as const },
      })),
    },
    select: { english: true },
  })

  const existingLower = new Set(existing.map((e) => e.english.toLowerCase()))
  const toInsert = terms.filter(
    (t) => !existingLower.has(t.english.toLowerCase())
  )

  const skipped = terms.length - toInsert.length

  if (toInsert.length === 0) {
    console.log('[glossary-callback] no new terms', { projectId, skipped })
    return NextResponse.json({ ok: true, inserted: 0, skipped }, { status: 200 })
  }

  try {
    const result = await prisma.glossaryTerm.createMany({
      data: toInsert.map((t) => ({
        projectId,
        english: t.english,
        translation: t.translation ?? null,
        category: t.category ?? 'general',
        approved: false,
        userEdited: false,
      })),
      skipDuplicates: true,
    })

    // If skipDuplicates silently dropped rows (race between concurrent
    // callbacks) surface it in logs so the divergence is at least observable.
    if (result.count !== toInsert.length) {
      console.warn('[glossary-callback] createMany dropped rows as duplicates', {
        projectId,
        requested: toInsert.length,
        inserted: result.count,
      })
    }

    console.log('[glossary-callback] inserted terms', {
      projectId,
      inserted: result.count,
      skipped,
    })

    return NextResponse.json(
      { ok: true, inserted: result.count, skipped },
      { status: 200 }
    )
  } catch (err) {
    console.error('[glossary-callback] createMany failed', {
      projectId,
      err: String(err),
    })
    return NextResponse.json(
      { error: 'Failed to persist terms' },
      { status: 500 }
    )
  }
}
