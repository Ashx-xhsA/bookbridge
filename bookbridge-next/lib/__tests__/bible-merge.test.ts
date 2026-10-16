import { describe, it, expect } from 'vitest'
import { planBibleMerge, type ExistingTerm, type ScannedEntity } from '@/lib/bible-merge'

function entity(overrides: Partial<ScannedEntity> = {}): ScannedEntity {
  return {
    english: 'Gandalf',
    translation: '甘道夫',
    category: 'person',
    gender: 'male',
    notes: null,
    voice: 'Grave.',
    mentions: 40,
    aliases: [],
    ...overrides,
  }
}

function term(overrides: Partial<ExistingTerm> = {}): ExistingTerm {
  return {
    id: 't1',
    english: 'Gandalf',
    translation: '冈达夫',
    approved: false,
    userEdited: false,
    gender: null,
    voice: null,
    notes: null,
    aliasOfId: null,
    ...overrides,
  }
}

describe('planBibleMerge', () => {
  it('creates new main terms with bible fields', () => {
    const plan = planBibleMerge([], [entity()])
    expect(plan.creates).toEqual([
      {
        english: 'Gandalf',
        translation: '甘道夫',
        category: 'person',
        gender: 'male',
        voice: 'Grave.',
        notes: null,
        mentions: 40,
      },
    ])
    expect(plan.updates).toEqual([])
    expect(plan.links).toEqual([])
  })

  it('creates aliases as their own terms linked to the main term', () => {
    const plan = planBibleMerge(
      [],
      [entity({ aliases: [{ english: 'Mithrandir', translation: '米斯兰达' }] })]
    )
    expect(plan.creates).toContainEqual(
      expect.objectContaining({ english: 'Mithrandir', translation: '米斯兰达', category: 'person' })
    )
    expect(plan.links).toEqual([{ alias: 'mithrandir', main: 'gandalf' }])
  })

  it('overwrites an unedited existing term with the scan values', () => {
    const plan = planBibleMerge([term()], [entity()])
    expect(plan.creates).toEqual([])
    expect(plan.updates).toEqual([
      {
        id: 't1',
        data: {
          translation: '甘道夫',
          category: 'person',
          gender: 'male',
          voice: 'Grave.',
          mentions: 40,
        },
      },
    ])
  })

  it.each([{ userEdited: true }, { approved: true }])(
    'keeps the translation of a term the user owns (%o) and only fills blanks',
    (flags) => {
      const plan = planBibleMerge([term({ ...flags, voice: 'Mine.' })], [entity()])
      expect(plan.updates).toEqual([{ id: 't1', data: { gender: 'male', mentions: 40 } }])
    }
  )

  it('matches existing terms case-insensitively', () => {
    const plan = planBibleMerge([term({ english: 'GANDALF' })], [entity()])
    expect(plan.creates).toEqual([])
    expect(plan.updates[0].id).toBe('t1')
  })

  it('links an existing unlinked alias and updates its translation unless user-owned', () => {
    const existing = [
      term(),
      term({ id: 't2', english: 'Mithrandir', translation: '灰袍' }),
      term({ id: 't3', english: 'Grey Pilgrim', translation: '灰袍朝圣者', userEdited: true }),
    ]
    const plan = planBibleMerge(existing, [
      entity({
        aliases: [
          { english: 'Mithrandir', translation: '米斯兰达' },
          { english: 'Grey Pilgrim', translation: '灰衣圣徒' },
        ],
      }),
    ])
    expect(plan.updates).toContainEqual({ id: 't2', data: { translation: '米斯兰达' } })
    expect(plan.updates.find((u) => u.id === 't3')).toBeUndefined()
    expect(plan.links).toEqual([
      { alias: 'mithrandir', main: 'gandalf' },
      { alias: 'grey pilgrim', main: 'gandalf' },
    ])
  })

  it('does not relink an alias that already points somewhere', () => {
    const existing = [term(), term({ id: 't2', english: 'Mithrandir', aliasOfId: 'tX' })]
    const plan = planBibleMerge(existing, [
      entity({ aliases: [{ english: 'Mithrandir', translation: '米斯兰达' }] }),
    ])
    expect(plan.links).toEqual([])
  })

  it('never turns a main entity of this scan into an alias', () => {
    const plan = planBibleMerge(
      [],
      [
        entity({ aliases: [{ english: 'Frodo', translation: '弗罗多' }] }),
        entity({ english: 'Frodo', translation: '弗罗多', voice: null }),
      ]
    )
    expect(plan.links).toEqual([])
    expect(plan.creates.filter((c) => c.english === 'Frodo')).toHaveLength(1)
  })

  it('ignores duplicate entities and duplicate aliases', () => {
    const alias = { english: 'Mithrandir', translation: '米斯兰达' }
    const plan = planBibleMerge(
      [],
      [entity({ aliases: [alias, alias] }), entity({ translation: '另一个' })]
    )
    expect(plan.creates.map((c) => c.english)).toEqual(['Gandalf', 'Mithrandir'])
    expect(plan.links).toHaveLength(1)
  })
})
