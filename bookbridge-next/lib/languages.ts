import { z } from 'zod'

// Must match ALLOWED_TARGET_LANGS in bookbridge/harness/models.py — the
// Worker rejects anything else, so every translate / scan would fail.
export const TARGET_LANGUAGES = [
  { code: 'zh-Hans', label: 'Chinese (Simplified)' },
  { code: 'zh-Hant', label: 'Chinese (Traditional)' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
] as const

const codes = TARGET_LANGUAGES.map((l) => l.code) as [string, ...string[]]
export const targetLangSchema = z.enum(codes)
