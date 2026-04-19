import prisma from '@/lib/prisma'

// Filters on isPublic=true so unknown tokens and unpublished projects both
// resolve to null. Callers must return 404 (never 403) on null — a 403 would
// confirm the project exists and enable enumeration (OWASP A01).
export async function getPublishedProject(token: string) {
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
