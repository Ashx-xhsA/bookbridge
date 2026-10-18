import { decryptApiKey } from '@/lib/api-key-crypto'
import prisma from '@/lib/prisma'

const PROVIDER_DEFAULTS: Record<string, { baseUrl: string; model: string }> = {
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  deepseek: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
}

export interface LLMCredentials {
  llm_api_key: string
  llm_base_url: string
  llm_model: string
}

export async function getUserLLMCredentials(
  clerkId: string
): Promise<LLMCredentials | null> {
  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { apiKey: true, apiProvider: true, apiBaseUrl: true },
  })

  if (!user?.apiKey) return null

  // The only place the key is decrypted: just before it goes to the Worker.
  let apiKey: string
  try {
    apiKey = decryptApiKey(user.apiKey, clerkId)
  } catch {
    // Never log the stored value. Treat it as missing so the user re-enters it.
    if (!process.env.API_KEY_ENCRYPTION_KEY) {
      console.error('API_KEY_ENCRYPTION_KEY is not set; no stored API key can be used')
    } else {
      console.warn('Stored API key could not be decrypted; treating it as missing')
    }
    return null
  }

  const provider = user.apiProvider || 'openai'
  const defaults = PROVIDER_DEFAULTS[provider]
  return {
    llm_api_key: apiKey,
    llm_base_url: user.apiBaseUrl || defaults?.baseUrl || '',
    llm_model: defaults?.model || 'gpt-4o-mini',
  }
}
