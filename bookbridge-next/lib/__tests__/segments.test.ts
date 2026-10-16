import { describe, it, expect } from 'vitest'
import { CHAPTER_PROGRESS, isFullyTranslated, joinSegments, joinTranslations } from '@/lib/segments'

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

  it('a segment whose retranslation failed is not done, though its old text stays visible', () => {
    const segs = [
      { translation: '甲', status: 'translated' },
      { translation: '旧译', status: 'failed' },
    ]
    expect(isFullyTranslated(segs)).toBe(false)
    expect(joinTranslations(segs)).toBe('甲\n\n旧译')
  })

  it('the progress probe counts failed segments as still to do', () => {
    expect(CHAPTER_PROGRESS.segments.where).toEqual({
      OR: [{ translation: null }, { status: 'failed' }],
    })
  })
})
