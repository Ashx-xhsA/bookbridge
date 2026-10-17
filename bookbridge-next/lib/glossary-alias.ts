import prisma from '@/lib/prisma'

// An alias ("Mithrandir") points at a main term ("Gandalf") in the same
// project. One level only: the target must not be an alias itself, and a
// term that already has aliases cannot become one. Returns an error message
// for a 400, or null when the link is valid.
export async function aliasLinkError(
  projectId: string,
  termId: string | null,
  aliasOfId: string
): Promise<string | null> {
  if (termId && aliasOfId === termId) return 'A term cannot be an alias of itself'
  const target = await prisma.glossaryTerm.findUnique({
    where: { id: aliasOfId },
    select: { projectId: true, aliasOfId: true },
  })
  if (!target || target.projectId !== projectId) return 'Alias target not found'
  if (target.aliasOfId) return 'Alias target is itself an alias'
  if (termId && (await prisma.glossaryTerm.count({ where: { aliasOfId: termId } })) > 0) {
    return 'This term has its own aliases'
  }
  return null
}
