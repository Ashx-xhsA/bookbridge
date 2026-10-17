import prisma from '@/lib/prisma'

// Characters of source text in a project. Recorded at upload; projects
// uploaded before that are measured once here and the result is saved.
export async function ensureSourceChars(projectId: string, recorded: number): Promise<number> {
  if (recorded > 0) return recorded
  const segments = await prisma.segment.findMany({
    where: { chapter: { projectId } },
    select: { source: true },
  })
  const chars = segments.reduce((n, s) => n + s.source.length, 0)
  if (chars > 0) await prisma.project.update({ where: { id: projectId }, data: { sourceChars: chars } })
  return chars
}
