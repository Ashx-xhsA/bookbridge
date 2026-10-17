// Merge a book-bible pre-scan into the project glossary — pure planning, no DB.
//
// Rules:
// - Terms are matched case-insensitively on `english`.
// - A term the user owns (edited or approved) keeps its translation and
//   category; the scan only fills blank notes and refreshes the mention count.
// - Other existing terms take the scan's values, and those the scan no longer
//   lists (as a name or an alias) are removed: a re-scan rebuilds the glossary,
//   keeping only what the user edited or approved.
// - Each alias is its own term (own translation) linked to its main term.
//   An existing alias that already points somewhere is not relinked, and a
//   name that is a main entity in this scan is never made an alias.
// - Links stay one level deep: a term with its own aliases is never made an
//   alias, and nothing is linked to a main term that is itself an alias.

export type ScannedEntity = {
  english: string
  translation: string
  category: string
  notes: string | null
  mentions: number
  aliases: { english: string; translation: string }[]
}

export type ExistingTerm = {
  id: string
  english: string
  translation: string | null
  approved: boolean
  userEdited: boolean
  notes: string | null
  aliasOfId: string | null
  // How many terms already point at this one.
  aliasCount: number
}

export type TermCreate = {
  english: string
  translation: string
  category: string
  notes: string | null
  mentions: number
}

export type TermUpdate = {
  id: string
  data: Partial<Omit<TermCreate, 'english'>>
}

export type MergePlan = {
  creates: TermCreate[]
  updates: TermUpdate[]
  // Ids of terms the user never touched that this scan does not list.
  deletes: string[]
  // Lowercased english keys; resolved to ids once creates have run.
  links: { alias: string; main: string }[]
}

export const termKey = (english: string) => english.trim().toLowerCase()

const owned = (t: ExistingTerm) => t.userEdited || t.approved

function blanks(t: ExistingTerm, e: ScannedEntity): TermUpdate['data'] {
  const data: TermUpdate['data'] = {}
  if (!t.notes && e.notes) data.notes = e.notes
  return data
}

function mainUpdate(t: ExistingTerm, e: ScannedEntity): TermUpdate {
  if (owned(t)) return { id: t.id, data: { ...blanks(t, e), mentions: e.mentions } }
  const data: TermUpdate['data'] = { translation: e.translation, category: e.category }
  if (!t.notes && e.notes) data.notes = e.notes
  return { id: t.id, data: { ...data, mentions: e.mentions } }
}

function mainCreate(e: ScannedEntity): TermCreate {
  const { english, translation, category, notes, mentions } = e
  return { english, translation, category, notes, mentions }
}

export function planBibleMerge(existing: ExistingTerm[], entities: ScannedEntity[]): MergePlan {
  const byKey = new Map(existing.map((t) => [termKey(t.english), t]))
  const mainKeys = new Set(entities.map((e) => termKey(e.english)))
  const plan: MergePlan = { creates: [], updates: [], deletes: [], links: [] }
  const done = new Set<string>()

  for (const e of entities) {
    const key = termKey(e.english)
    if (done.has(key)) continue
    done.add(key)
    const found = byKey.get(key)
    if (found) plan.updates.push(mainUpdate(found, e))
    else plan.creates.push(mainCreate(e))

    for (const alias of e.aliases) {
      const aliasKey = termKey(alias.english)
      if (mainKeys.has(aliasKey) || done.has(aliasKey)) continue
      done.add(aliasKey)
      planAlias(plan, byKey.get(aliasKey), alias, e.category)
      if (canLink(byKey.get(aliasKey), found)) plan.links.push({ alias: aliasKey, main: key })
    }
  }
  const listed = new Set(
    entities.flatMap((e) => [termKey(e.english), ...e.aliases.map((a) => termKey(a.english))])
  )
  plan.deletes = existing.filter((t) => !owned(t) && !listed.has(termKey(t.english))).map((t) => t.id)
  return plan
}

function canLink(alias: ExistingTerm | undefined, main: ExistingTerm | undefined): boolean {
  if (main?.aliasOfId) return false
  return !alias || (!alias.aliasOfId && alias.aliasCount === 0)
}

function planAlias(
  plan: MergePlan,
  found: ExistingTerm | undefined,
  alias: { english: string; translation: string },
  category: string
) {
  if (!found) {
    plan.creates.push({
      english: alias.english,
      translation: alias.translation,
      category,
      notes: null,
      mentions: 0,
    })
  } else if (!owned(found)) {
    plan.updates.push({ id: found.id, data: { translation: alias.translation } })
  }
}
