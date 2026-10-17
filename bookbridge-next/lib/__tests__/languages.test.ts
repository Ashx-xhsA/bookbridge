import { describe, it, expect } from 'vitest'
import { TARGET_LANGUAGES, targetLangSchema } from '@/lib/languages'

describe('target languages', () => {
  it('matches the Worker allow-list (bookbridge/harness/models.py)', () => {
    expect(TARGET_LANGUAGES.map((l) => l.code).sort()).toEqual(
      ['de', 'es', 'fr', 'ja', 'ko', 'zh-Hans', 'zh-Hant'].sort()
    )
  })

  it('validates codes', () => {
    expect(targetLangSchema.safeParse('zh-Hant').success).toBe(true)
    expect(targetLangSchema.safeParse('ar').success).toBe(false)
  })
})
