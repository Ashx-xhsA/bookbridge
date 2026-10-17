import { NextRequest, NextResponse } from 'next/server'
import { getPublishedProjectId, tokenSchema } from '@/lib/public-project'
import { searchQuerySchema, searchSegments } from '@/lib/segment-search'

// Shared-link search: the token is the authorization. Unknown and
// unpublished tokens both get 404 so project existence never leaks.

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const token = tokenSchema.safeParse((await params).token)
  const q = searchQuerySchema.safeParse(req.nextUrl.searchParams.get('q'))
  if (!token.success || !q.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const projectId = await getPublishedProjectId(token.data)
  if (!projectId) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 404 })
  }

  return NextResponse.json({ data: await searchSegments(projectId, q.data) })
}
