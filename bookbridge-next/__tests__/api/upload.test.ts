import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  clerkMiddleware: vi.fn(() => vi.fn()),
  createRouteMatcher: vi.fn(() => vi.fn()),
}))

const mockProjectCreate = vi.fn()
const mockProjectUpdate = vi.fn()
const mockChapterCreate = vi.fn()
const mockUserUpsert = vi.fn()

vi.mock('@/lib/prisma', () => ({
  default: {
    project: {
      create: (...args: unknown[]) => mockProjectCreate(...args),
      update: (...args: unknown[]) => mockProjectUpdate(...args),
    },
    chapter: {
      create: (...args: unknown[]) => mockChapterCreate(...args),
    },
    user: {
      upsert: (...args: unknown[]) => mockUserUpsert(...args),
    },
  },
}))

import { auth } from '@clerk/nextjs/server'

describe('POST /api/upload — unit tests via mocked formData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mockUserUpsert.mockResolvedValue({ id: 'u1' })
    mockProjectCreate.mockResolvedValue({ id: 'proj-new' })
    mockProjectUpdate.mockResolvedValue({})
  })

  it('returns 401 when user is not authenticated', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: null } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
    const { POST } = await import('@/app/api/upload/route')
    const fakeFormData = {
      get: (key: string) => {
        if (key === 'file') return { name: 'test.pdf' }
        if (key === 'title') return 'Book'
        if (key === 'targetLang') return 'zh-Hans'
        return null
      },
    }
    const req = { formData: () => Promise.resolve(fakeFormData) } as unknown as import('next/server').NextRequest
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 when no PDF file is provided', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: 'user_abc' } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
    const { POST } = await import('@/app/api/upload/route')
    const fakeFormData = {
      get: (key: string) => {
        if (key === 'file') return null
        if (key === 'title') return 'Book'
        return null
      },
    }
    const req = { formData: () => Promise.resolve(fakeFormData) } as unknown as import('next/server').NextRequest
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('PDF')
  })

  it('creates a project and returns projectId on valid upload', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: 'user_abc' } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
    const mockFetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ chapters: [] }), { status: 200 })
    )
    vi.stubGlobal('fetch', mockFetch)
    const { POST } = await import('@/app/api/upload/route')
    const fakeFile = { name: 'novel.pdf' }
    const fakeFormData = {
      get: (key: string) => {
        if (key === 'file') return fakeFile
        if (key === 'title') return 'My Novel'
        if (key === 'targetLang') return 'zh-Hans'
        return null
      },
    }
    const req = { formData: () => Promise.resolve(fakeFormData) } as unknown as import('next/server').NextRequest
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.projectId).toBe('proj-new')
  })

  it('upserts user before creating project', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: 'user_xyz' } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ chapters: [] }), { status: 200 })
    ))
    const { POST } = await import('@/app/api/upload/route')
    const fakeFormData = {
      get: (key: string) => {
        if (key === 'file') return { name: 'book.pdf' }
        if (key === 'title') return 'Test'
        if (key === 'targetLang') return 'zh-Hans'
        return null
      },
    }
    const req = { formData: () => Promise.resolve(fakeFormData) } as unknown as import('next/server').NextRequest
    await POST(req)
    expect(mockUserUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clerkId: 'user_xyz' },
      })
    )
  })

  it('handles worker failure gracefully — still returns projectId', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: 'user_abc' } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('Worker down')))
    const { POST } = await import('@/app/api/upload/route')
    const fakeFormData = {
      get: (key: string) => {
        if (key === 'file') return { name: 'doc.pdf' }
        if (key === 'title') return 'Doc'
        if (key === 'targetLang') return 'es'
        return null
      },
    }
    const req = { formData: () => Promise.resolve(fakeFormData) } as unknown as import('next/server').NextRequest
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(mockProjectUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'READY' }),
      })
    )
  })
})
