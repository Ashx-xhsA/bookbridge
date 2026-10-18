/**
 * getUserLLMCredentials is the only place the stored API key is decrypted,
 * right before it is forwarded to the Worker.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { encryptApiKey } from '@/lib/api-key-crypto'

const mockFindUnique = vi.fn()
vi.mock('@/lib/prisma', () => ({
  default: { user: { findUnique: (...a: unknown[]) => mockFindUnique(...a) } },
}))

import { getUserLLMCredentials } from '@/lib/llm-credentials'

describe('getUserLLMCredentials', () => {
  beforeEach(() => vi.clearAllMocks())

  it('decrypts the stored key for its owner', async () => {
    mockFindUnique.mockResolvedValue({
      apiKey: encryptApiKey('sk-secret', 'user_1'),
      apiProvider: 'deepseek',
      apiBaseUrl: null,
    })
    const creds = await getUserLLMCredentials('user_1')
    expect(creds).toEqual({
      llm_api_key: 'sk-secret',
      llm_base_url: 'https://api.deepseek.com/v1',
      llm_model: 'deepseek-chat',
    })
  })

  it('returns null when there is no key', async () => {
    mockFindUnique.mockResolvedValue({ apiKey: null, apiProvider: 'openai', apiBaseUrl: null })
    expect(await getUserLLMCredentials('user_1')).toBeNull()
  })

  it('returns null without logging the value when the key cannot be decrypted', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockFindUnique.mockResolvedValue({ apiKey: 'sk-plaintext-legacy', apiProvider: 'openai', apiBaseUrl: null })

    expect(await getUserLLMCredentials('user_1')).toBeNull()

    const logged = JSON.stringify([...warn.mock.calls, ...error.mock.calls])
    expect(logged).not.toContain('sk-plaintext-legacy')
    warn.mockRestore()
    error.mockRestore()
  })

  it("will not decrypt another user's ciphertext", async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockFindUnique.mockResolvedValue({
      apiKey: encryptApiKey('sk-victim', 'user_victim'),
      apiProvider: 'openai',
      apiBaseUrl: null,
    })
    expect(await getUserLLMCredentials('user_attacker')).toBeNull()
  })
})
