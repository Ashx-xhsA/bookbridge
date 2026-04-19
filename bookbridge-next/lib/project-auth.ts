import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export type GuardResult =
  | { ok: true }
  | { ok: false; response: NextResponse }

export async function requireProjectOwner(
  projectId: string,
  userId: string,
): Promise<GuardResult> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, ownerId: true },
  })
  if (!project) {
    return { ok: false, response: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  }
  if (project.ownerId !== userId) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { ok: true }
}
