import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const title = (formData.get('title') as string) || 'Untitled'
  const targetLang = (formData.get('targetLang') as string) || 'zh-Hans'

  if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json(
      { error: 'A PDF file is required.' },
      { status: 400 }
    )
  }

  await prisma.user.upsert({
    where: { clerkId: userId },
    update: {},
    create: { clerkId: userId, email: `${userId}@placeholder.local` },
  })

  const project = await prisma.project.create({
    data: {
      title,
      sourceFile: file.name,
      targetLang,
      ownerId: userId,
      status: 'PARSING',
    },
  })

  try {
    const workerUrl = process.env.WORKER_URL || 'http://localhost:8000'
    const workerForm = new FormData()
    workerForm.append('file', file)

    const workerRes = await fetch(`${workerUrl}/parse`, {
      method: 'POST',
      body: workerForm,
    })

    if (!workerRes.ok) {
      await prisma.project.update({
        where: { id: project.id },
        data: { status: 'READY' },
      })
    } else {
      const workerData = await workerRes.json()

      if (workerData.chapters && Array.isArray(workerData.chapters)) {
        for (const ch of workerData.chapters) {
          await prisma.chapter.create({
            data: {
              projectId: project.id,
              number: ch.number || ch.chunk_id || 1,
              title: ch.title || `Chapter ${ch.number || 1}`,
              startPage: ch.start_page || 1,
              endPage: ch.end_page || 1,
              pageCount: ch.page_count || 1,
              sourceContent: ch.content || null,
            },
          })
        }
      }

      await prisma.project.update({
        where: { id: project.id },
        data: { status: 'READY' },
      })
    }
  } catch {
    await prisma.project.update({
      where: { id: project.id },
      data: { status: 'READY' },
    })
  }

  return NextResponse.json({ projectId: project.id })
}
