import { z } from 'zod'
import prisma from '@/lib/prisma'

// publicToken is minted via crypto.randomUUID() in the project publish flow, so
// the format is strict — reject anything non-UUID at the edge to shrink the
// attack surface before the DB is touched.
export const tokenSchema = z.string().uuid()

// Filters on isPublic=true so unknown tokens and unpublished projects both
// resolve to null. Callers must return 404 (never 403) on null — a 403 would
// confirm the project exists and enable enumeration (OWASP A01).

export async function getPublishedProjectId(
  token: string,
): Promise<string | null> {
  const project = await prisma.project.findFirst({
    where: { publicToken: token, isPublic: true },
    select: { id: true },
  })
  return project?.id ?? null
}

export async function getPublishedProjectWithChapters(token: string) {
  return prisma.project.findFirst({
    where: { publicToken: token, isPublic: true },
    include: {
      chapters: {
        orderBy: { number: 'asc' },
        select: { id: true, number: true, title: true },
      },
    },
  })
}

// Reader-page variant: includes sourceContent + translation so the public
// reader can render the full two-column view in one Server Component pass.
// Exposing chunks in bulk is OK here because the token IS the authorization —
// same privilege as the per-chunk endpoint, just batched.
export async function getPublishedProjectForReader(token: string) {
  return prisma.project.findFirst({
    where: { publicToken: token, isPublic: true },
    include: {
      chapters: {
        orderBy: { number: 'asc' },
      },
    },
  })
}
