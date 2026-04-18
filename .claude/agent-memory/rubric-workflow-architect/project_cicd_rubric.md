---
name: CI/CD Pipeline Rubric Detail
description: W14 CI/CD & Production rubric worth 35 pts; all 8 pipeline stages required for Excellent band; current implementation gaps documented
type: project
---

CI/CD & Production is worth 35 points. The Excellent band (35 pts) requires all 8 pipeline stages green AND 4+ security gates AND OWASP in CLAUDE.md.

**The 8 required pipeline stages:**
1. Lint (ESLint + Prettier) — currently missing from ci.yml (only `npm run lint` exists, Prettier check not separate)
2. Type checking (tsc --noEmit) — in ci.yml as `npm run typecheck` (needs package.json script)
3. Unit and integration tests — in ci.yml as `npm run test:coverage`
4. E2E tests (Playwright) — in ci.yml e2e job, but missing `npm run build && npm run start` before playwright (uses `npm run dev` which is dev-only)
5. Security scan (npm audit) — in security.yml Gate 2, NOT in ci.yml (grader looks for it in the main pipeline)
6. AI PR review — in security.yml as Claude script, but claude-code-action is the preferred approach for rubric evidence
7. Preview deploy (Vercel) — NOT in any workflow file yet (needs Vercel GitHub integration or vercel action)
8. Production deploy on merge to main — NOT in any workflow file yet

**Current status as of 2026-04-17:**
- Stages 1-4: Partially covered in ci.yml (gaps: no Prettier, no build step before E2E)
- Stage 5: In security.yml but not ci.yml — grader may not count it as "in the pipeline"
- Stage 6: In security.yml as raw Python/claude API call — not using claude-code-action
- Stages 7-8: Completely missing — no Vercel workflow exists

**Key gaps to fix:**
- Add `npm run format:check` (Prettier) to nextjs job OR add --max-warnings 0 to eslint
- Move npm audit into ci.yml nextjs job OR add a note that security.yml counts
- Add vercel-action or configure Vercel GitHub integration for preview deploys
- Production deploy on merge: Vercel auto-handles this via GitHub integration — just needs the project connected
- E2E job: switch from `npm run dev` to `npm run build && npm run start` for CI reliability
- AI PR review: Consider using anthropics/claude-code-action@beta for cleaner evidence

**Why the grader counts stages:** The rubric says "All 8 pipeline stages green" — this means all 8 must be visible and passing in GitHub Actions, not just configured. Preview and prod deploy are verified by the Vercel deployment URL appearing in PR checks.

**How to apply:** When the Next.js app is initialized (package.json exists), update ci.yml to add Prettier check and npm audit to the nextjs job. Configure Vercel GitHub integration (not a workflow file) for stages 7-8.
