---
name: Sprint 2 Infrastructure Status
description: What was committed on 2026-04-17 as Sprint 2 pre-work; what remains for Sprint 2 proper
type: project
---

On 2026-04-17, the following config/CI infrastructure was committed as Sprint 2 pre-work (no Next.js app yet):

**Completed:**
- `.claude/settings.json` — added Stop hook (pytest quality gate) and PreToolUse TDD guard; now has 3 hooks total (PostToolUse + Stop + PreToolUse). Also expanded `permissions.allow` with `app/**`, `.github/**`, vitest/playwright config files, `npx*`, `npm*`.
- `.github/workflows/ci.yml` — new CI workflow with three jobs: `python` (always runs), `nextjs` (guarded by `hashFiles('package.json')`), `e2e` (guarded by `hashFiles('playwright.config.ts')`). Guards keep CI green until Next.js app exists.
- `vitest.config.ts` — Vitest config with jsdom, v8 coverage, 70% thresholds on `app/api/**` + `lib/**`.
- `vitest.setup.ts` — imports `@testing-library/jest-dom`.
- `playwright.config.ts` — Playwright config with chromium project, storageState auth, `webServer` pointing to `npm run dev`.
- `e2e/.gitkeep` — placeholder so `e2e/` directory is tracked.
- `docs/sprint-2-planning.md` — Sprint 2 goal, dates, deliverables, DoD, architecture constraints.
- `docs/workflow-checklist.md` — updated hooks rows (3x ✅), CI/CD unit/E2E/security rows (✅), TDD bootstrap rows (✅), docs `.claude/` row (hooks complete), Sprint 2 planning row (✅).

**Still needed in Sprint 2 proper (runtime/deployment):**
- `npx create-next-app@latest` — initializes `app/`, `package.json`, `tsconfig.json`
- Clerk account + `@clerk/nextjs` integration
- Vercel project connection (preview + prod deploys)
- PostgreSQL on Railway + Prisma schema + first migration
- Feature 1 TDD: `POST /api/upload` — `test(red):` commit then `feat(next):` commit
- Feature 2 TDD: `POST /api/jobs` — `test(red):` commit then `feat(next):` commit
- 2 PRs with writer/reviewer pattern

**Why:** Sprint 2 infrastructure was pre-committed so CI and hook rubric items can be verified immediately without waiting for Next.js bootstrap. The `hashFiles` guards in `ci.yml` are the key mechanism that keeps the pipeline green before `package.json` exists.

**How to apply:** When Sprint 2 proper starts (Next.js init), the `nextjs` and `e2e` CI jobs will automatically activate — no changes to `ci.yml` needed. The first `feat(next):` commit will trigger the PreToolUse TDD guard if no `test(red):` precedes it on the branch.
