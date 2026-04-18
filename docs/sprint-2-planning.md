# Sprint 2 Planning

## Sprint Goal

"Deploy First — FastAPI Worker + Next.js shell + full CI/CD pipeline live"

The primary outcome of Sprint 2 is a publicly accessible Vercel deployment with Clerk authentication, a Prisma-backed PostgreSQL schema, two TDD-verified API routes, and all CI stages green.

## Dates

- Sprint start: 2026-04-17
- Sprint end: TBD (target ~2 weeks)

## Team

- Ash — chen.zhanyi@northeastern.edu

## Key Deliverables

| # | Deliverable | Notes |
|---|-------------|-------|
| 1 | Next.js 15 App Router initialization | `npx create-next-app@latest`, TypeScript, ESLint, Tailwind |
| 2 | Clerk auth integration | `@clerk/nextjs` middleware, `auth()` on all API routes, `useUser()` in client components |
| 3 | Prisma schema + first migration | `User`, `Project`, `TranslationJob` models; PostgreSQL on Railway |
| 4 | `POST /api/upload` — Feature 1 (TDD) | PDF upload → proxy to Worker `/parse` → return chapter list; `test(red):` commit before `feat(next):` |
| 5 | `POST /api/jobs` — Feature 2 (TDD) | Create translation job record in Postgres; `test(red):` commit before `feat(next):` |
| 6 | Vercel deploy | Connect repo, set env vars (`CLERK_*`, `DATABASE_URL`, `WORKER_URL`, `WORKER_SECRET`), confirm preview + prod deploy |
| 7 | CI stages green | `python` job already passes; `nextjs` job activates once `package.json` exists |

## TDD Commitment

Each Next.js feature follows strict red-green order:

1. `/start-issue <N>` → test-writer sub-agent writes failing tests → `test(red):` commit
2. Implement the route → `feat(next):` commit
3. Refactor if needed → `refactor:` commit

Grader verification: `git log --oneline` must show each `test(red):` SHA earlier than its paired `feat(next):` SHA.

## Definition of Done

- [ ] All CI stages green (python + nextjs jobs in `ci.yml`)
- [ ] At least 2 PRs merged using writer/reviewer pattern
- [ ] At least 2 `test(red):` / `feat(next):` commit pairs in git history
- [ ] Vercel production URL accessible
- [ ] Clerk sign-in/sign-up flow working
- [ ] `POST /api/upload` and `POST /api/jobs` returning correct responses
- [ ] Sprint 2 retrospective written

## Architecture Constraints (Do Not Violate)

- Browser never calls Worker directly — all Worker calls go through Next.js API Routes
- `WORKER_URL` is an env var only — never hardcoded
- Zod validation on all API Route inputs before touching Worker or Prisma
- `auth()` called at the top of every API Route handler
- Ownership check (`resource.ownerId === userId`) on all `[id]` routes
- PostgreSQL via Prisma only — no raw SQL, no SQLite, no ChromaDB as persistent state
