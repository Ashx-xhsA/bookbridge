import { describe, it, expect } from 'vitest'
import { isFullyTranslated, joinSegments, joinTranslations } from '@/lib/segments'

describe('segment helpers', () => {
  it('joinSegments joins sources with a blank line', () => {
    expect(joinSegments([{ source: 'A.' }, { source: 'B.' }])).toBe('A.\n\nB.')
  })

  it('joinTranslations returns null when nothing is translated', () => {
    expect(joinTranslations([{ translation: null }, { translation: null }])).toBeNull()
    expect(joinTranslations([])).toBeNull()
  })

  it('joinTranslations joins translated segments and skips untranslated ones', () => {
    expect(
      joinTranslations([{ translation: '甲' }, { translation: null }, { translation: '丙' }])
    ).toBe('甲\n\n丙')
  })

  it('isFullyTranslated requires at least one segment and every translation', () => {
    expect(isFullyTranslated([])).toBe(false)
    expect(isFullyTranslated([{ translation: '甲' }, { translation: null }])).toBe(false)
    expect(isFullyTranslated([{ translation: '甲' }, { translation: '乙' }])).toBe(true)
  })
})
