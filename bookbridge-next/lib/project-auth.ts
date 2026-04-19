import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export type GuardFailure = 'not_found' | 'forbidden'

export type GuardResult =
  | { ok: true }
  | { ok: false; reason: GuardFailure; response: NextResponse }

export async function requireProjectOwner(
  projectId: string,
  userId: string,
): Promise<GuardResult> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, ownerId: true },
  })
  if (!project) {
    return {
      ok: false,
      reason: 'not_found',
      response: NextResponse.json({ error: 'Not found' }, { status: 404 }),
    }
  }
  if (project.ownerId !== userId) {
    return {
      ok: false,
      reason: 'forbidden',
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    }
  }
  return { ok: true }
}
