import { z } from 'zod'
import type { Prisma } from '@/app/generated/prisma/client'
import prisma from '@/lib/prisma'

// One page of book-bible entries (main names only; aliases ride along), for
// the review page. Characters and everything else are paged separately.

export const BIBLE_PAGE_SIZE = 50

export const bibleGroupSchema = z.enum(['person', 'other'])
export type BibleGroup = z.infer<typeof bibleGroupSchema>

export const bibleQuerySchema = z.object({
  group: bibleGroupSchema,
  q: z.string().trim().max(100).optional(),
  cursor: z.string().min(1).max(128).optional(),
})

const ENTRY_SELECT = {
  id: true,
  english: true,
  translation: true,
  category: true,
  gender: true,
  voice: true,
  mentions: true,
  approved: true,
  userEdited: true,
  aliases: {
    orderBy: { english: 'asc' },
    select: { id: true, english: true, translation: true },
  },
} as const

function entryWhere(projectId: string, group: BibleGroup, q?: string): Prisma.GlossaryTermWhereInput {
  const where: Prisma.GlossaryTermWhereInput = {
    projectId,
    aliasOfId: null,
    category: group === 'person' ? 'person' : { not: 'person' },
  }
  if (!q) return where
  const match = { contains: q, mode: 'insensitive' as const }
  return {
    ...where,
    OR: [{ english: match }, { translation: match }, { aliases: { some: { english: match } } }],
  }
}

export async function loadBibleEntries(
  projectId: string,
  { group, q, cursor }: { group: BibleGroup; q?: string; cursor?: string }
) {
  const where = entryWhere(projectId, group, q || undefined)
  const [rows, total] = await Promise.all([
    prisma.glossaryTerm.findMany({
      where,
      orderBy: [{ mentions: 'desc' }, { english: 'asc' }, { id: 'asc' }],
      select: ENTRY_SELECT,
      take: BIBLE_PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    }),
    prisma.glossaryTerm.count({ where }),
  ])
  const entries = rows.slice(0, BIBLE_PAGE_SIZE)
  const nextCursor = rows.length > BIBLE_PAGE_SIZE ? entries[entries.length - 1].id : null
  return { entries, total, nextCursor }
}
