import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { requireProjectOwner } from '@/lib/project-auth'
import { bibleQuerySchema, loadBibleEntries } from '@/lib/bible-entries'

// One page of bible entries for the review page:
// ?group=person|other[&q=name][&cursor=<last id of the previous page>]
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const parsed = bibleQuerySchema.safeParse({
    group: sp.get('group') ?? undefined,
    q: sp.get('q') ?? undefined,
    cursor: sp.get('cursor') ?? undefined,
  })
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const guard = await requireProjectOwner(projectId, userId)
  if (!guard.ok) return guard.response

  const { entries, total, nextCursor } = await loadBibleEntries(projectId, parsed.data)
  return NextResponse.json(
    { data: entries, total, nextCursor },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
