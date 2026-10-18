import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { encryptApiKey } from '@/lib/api-key-crypto'
import { isAllowedBaseUrl } from '@/lib/base-url-guard'
import prisma from '@/lib/prisma'

const BASE_URL_ERROR = 'Base URL must be a public https:// address'

const updateSchema = z.object({
  apiKey: z.string().min(1).max(256).optional().nullable(),
  apiProvider: z.enum(['openai', 'claude', 'deepseek', 'custom']).optional(),
  // The Worker calls this URL with the user's key: public https only (A10).
  apiBaseUrl: z
    .string()
    .max(512)
    .refine((url) => isAllowedBaseUrl(url), { message: BASE_URL_ERROR })
    .optional()
    .nullable(),
})

export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { apiProvider: true, apiBaseUrl: true, apiKey: true },
  })

  if (!user) {
    return NextResponse.json({ apiProvider: 'openai', apiBaseUrl: null, hasApiKey: false })
  }

  return NextResponse.json({
    apiProvider: user.apiProvider,
    apiBaseUrl: user.apiBaseUrl,
    hasApiKey: !!user.apiKey,
  })
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = await updateSchema.safeParseAsync(raw)
  if (!parsed.success) {
    const badBaseUrl = parsed.error.issues.some((i) => i.path[0] === 'apiBaseUrl')
    return NextResponse.json(
      { error: badBaseUrl ? BASE_URL_ERROR : 'Invalid request body' },
      { status: 400 }
    )
  }

  const data: Record<string, unknown> = {}
  if (parsed.data.apiProvider !== undefined) data.apiProvider = parsed.data.apiProvider
  if (parsed.data.apiBaseUrl !== undefined) data.apiBaseUrl = parsed.data.apiBaseUrl

  let user
  try {
    // Encrypted at rest; the plaintext key is never stored or returned.
    if (parsed.data.apiKey !== undefined) {
      data.apiKey = parsed.data.apiKey === null ? null : encryptApiKey(parsed.data.apiKey, userId)
    }
    user = await prisma.user.upsert({
      where: { clerkId: userId },
      update: data,
      create: {
        clerkId: userId,
        email: `${userId}@placeholder.local`,
        ...data,
      },
      select: { apiProvider: true, apiBaseUrl: true, apiKey: true },
    })
  } catch {
    console.error('Failed to save settings')
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
  }

  return NextResponse.json({
    apiProvider: user.apiProvider,
    apiBaseUrl: user.apiBaseUrl,
    hasApiKey: !!user.apiKey,
  })
}
