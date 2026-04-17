---
name: TDD & Testing Rubric Requirements
description: W11 Testing & TDD rubric worth 30 pts; requires 3+ red-green-refactor features visible in git, 70%+ coverage, unit+integration+E2E (Playwright)
type: project
---

Testing & TDD is worth 30 points (15% of total score). The rubric has four hard requirements that must all be satisfied to reach the "Excellent" band (30 pts).

**The four requirements:**
1. TDD red-green-refactor for 3+ features — git history must show `test(red):` commit BEFORE corresponding `feat(green):` commit for each feature
2. Unit + integration tests (Vitest or Jest) for Next.js; pytest already covers Python Worker
3. At least 1 E2E test (Playwright)
4. 70%+ test coverage (Next.js: Vitest coverage; Python: pytest-cov)

**Why:** The grader inspects git log chronology, not just whether tests exist. A `feat(green):` commit with no prior `test(red):` commit on the same feature is treated as "tests written after code" — drops to the 15-point Satisfactory band.

**How to apply:** Every new Next.js feature must be started with a `test(red):` commit. Use the `start-issue` skill to trigger the `test-writer` sub-agent before any implementation code is written. The sub-agent's job is to create the failing test file and commit it first.

**Status as of 2026-04-17:** Python Worker has passing pytest suite (Sprint 1). Next.js app (`app/`) does not yet exist — Vitest, Playwright, and the test infrastructure all need to be bootstrapped as part of Sprint 2 setup.

**Three features that will satisfy the "3+ features" requirement:**
- Feature 1: PDF upload endpoint (`POST /api/upload`) — Vitest unit + integration
- Feature 2: Translation job creation (`POST /api/jobs`) — Vitest unit + integration  
- Feature 3: Glossary term CRUD — Vitest unit + integration
- E2E: Full upload → job → view translation flow (Playwright)

**Coverage strategy:** Aim for 75%+ to have a buffer. Server Components are hard to unit test — focus coverage on API Route handlers, utility functions, and Zod schemas where line coverage is easy to hit.
