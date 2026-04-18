import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const projects = await prisma.project.findMany({
    where: { ownerId: userId },
    include: {
      chapters: { select: { id: true, number: true, title: true } },
      _count: { select: { jobs: true, glossary: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })

  return NextResponse.json({ data: projects })
}
