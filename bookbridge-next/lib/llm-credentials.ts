import prisma from '@/lib/prisma'

const PROVIDER_DEFAULTS: Record<string, { baseUrl: string; model: string }> = {
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  deepseek: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  claude: { baseUrl: 'https://api.anthropic.com/v1', model: 'claude-3-haiku-20240307' },
}

export interface LLMCredentials {
  llm_api_key: string
  llm_base_url: string
  llm_model: string
}

/**
 * Resolve LLM credentials for a user: user's own key + provider, or built-in fallback.
 * Returns null if no credentials available (neither user nor built-in).
 */
export async function getUserLLMCredentials(
  clerkId: string
): Promise<LLMCredentials | null> {
  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { apiKey: true, apiProvider: true, apiBaseUrl: true },
  })

  if (user?.apiKey) {
    const provider = user.apiProvider || 'openai'
    const defaults = PROVIDER_DEFAULTS[provider]
    return {
      llm_api_key: user.apiKey,
      llm_base_url: user.apiBaseUrl || defaults?.baseUrl || '',
      llm_model: defaults?.model || 'gpt-4o-mini',
    }
  }

  const builtinKey = process.env.BUILTIN_LLM_API_KEY
  if (builtinKey) {
    return {
      llm_api_key: builtinKey,
      llm_base_url: 'https://api.deepseek.com/v1',
      llm_model: 'deepseek-chat',
    }
  }

  return null
}
