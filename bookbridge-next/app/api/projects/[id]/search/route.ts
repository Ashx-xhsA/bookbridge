import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireProjectOwner } from '@/lib/project-auth'
import { searchQuerySchema, searchSegments } from '@/lib/segment-search'

const idSchema = z.string().min(1).max(128)

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const id = idSchema.safeParse((await params).id)
  const q = searchQuerySchema.safeParse(req.nextUrl.searchParams.get('q'))
  if (!id.success || !q.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const guard = await requireProjectOwner(id.data, userId)
  if (!guard.ok) return guard.response

  return NextResponse.json({ data: await searchSegments(id.data, q.data) })
}
