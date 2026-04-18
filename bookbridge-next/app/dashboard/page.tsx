import Link from 'next/link'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { Plus, FileText, Clock, CheckCircle } from 'lucide-react'
import prisma from '@/lib/prisma'

const statusColors: Record<string, string> = {
  DRAFT: 'bg-zinc-100 text-zinc-700',
  PARSING: 'bg-yellow-100 text-yellow-700',
  READY: 'bg-blue-100 text-blue-700',
  TRANSLATING: 'bg-purple-100 text-purple-700',
  COMPLETED: 'bg-green-100 text-green-700',
}

export default async function DashboardPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const projects = await prisma.project.findMany({
    where: { ownerId: userId },
    include: { chapters: true, jobs: true },
    orderBy: { updatedAt: 'desc' },
  })

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">My Projects</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Manage your translation projects
          </p>
        </div>
        <Link
          href="/dashboard/new"
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          New Project
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="mt-16 text-center">
          <FileText className="mx-auto h-12 w-12 text-zinc-300" />
          <h3 className="mt-4 text-lg font-medium">No projects yet</h3>
          <p className="mt-2 text-sm text-zinc-500">
            Upload a PDF to start translating.
          </p>
          <Link
            href="/dashboard/new"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Create your first project
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => {
            const completedJobs = project.jobs.filter(
              (j) => j.status === 'COMPLETED'
            ).length
            const totalChapters = project.chapters.length
            const progress =
              totalChapters > 0
                ? Math.round((completedJobs / totalChapters) * 100)
                : 0

            return (
              <Link
                key={project.id}
                href={`/dashboard/projects/${project.id}`}
                className="group rounded-xl border border-zinc-200 p-5 transition hover:border-blue-300 hover:shadow-md dark:border-zinc-800 dark:hover:border-blue-800"
              >
                <div className="flex items-start justify-between">
                  <h3 className="font-semibold group-hover:text-blue-600">
                    {project.title}
                  </h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[project.status] || statusColors.DRAFT}`}
                  >
                    {project.status}
                  </span>
                </div>
                <p className="mt-2 text-sm text-zinc-500">
                  {project.sourceLang} &rarr; {project.targetLang}
                </p>
                <div className="mt-4 flex items-center gap-4 text-xs text-zinc-400">
                  <span className="flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5" />
                    {totalChapters} chapters
                  </span>
                  <span className="flex items-center gap-1">
                    {progress === 100 ? (
                      <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <Clock className="h-3.5 w-3.5" />
                    )}
                    {progress}% translated
                  </span>
                </div>
                {totalChapters > 0 && (
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-blue-600 transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
