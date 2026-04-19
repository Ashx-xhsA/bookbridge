# Evidence & Screenshot Checklist

Items required to satisfy rubric grading — screenshots, links, or command output for each.

---

## Claude Code Mastery

- [x] **Auto-memory** — Claude Code persists cross-session memory at `~/.claude/projects/-Users-mineral-Desktop-bookbridge/memory/`. The index file (`MEMORY.md`) and per-topic files are active and recalled automatically at the start of each session.

  Memory files present (as of 2026-04-18):
  - `MEMORY.md` (index)
  - `user_profile.md`
  - `project_status.md`
  - `evidence_collected.md`
  - `workflow_preferences.md`
  - `harness_provider_decisions.md`

  `MEMORY.md` contents (recalled each session):
  ```markdown
  # Memory Index

  - [User Profile](user_profile.md) — CS student, BookBridge pair project, comfortable with git/GitHub CLI
  - [Project Status](project_status.md) — Sprint 4 in progress; reader-view loop complete; PR #54 open
  - [Evidence Collected](evidence_collected.md) — Rubric evidence gathered so far (PRs, TDD commits, etc.)
  - [Workflow Preferences](workflow_preferences.md) — Prefers concise responses; uses gh CLI; evidence-first approach
  - [Harness / Worker Provider Decisions](harness_provider_decisions.md) — provider tradeoffs, local run command, mac SSL fix, timeout split
  ```

  > **TODO before final submission**: snapshot the full `~/.claude/projects/-Users-mineral-Desktop-bookbridge/memory/` directory into `docs/claude-memory/` and commit so graders can read the memory contents directly from the repo. Do this **once** at end-of-project — memory evolves mid-sprint, a late snapshot captures the richest state.
- [ ] **Custom Skills usage** — session logs or screenshots showing team using `tdd-add-module`, `start-issue`, `create-pr`

  - Create-pr

    ![create-pr skill — step 1](./docs/evidence/image-20260418173231573.png)

    ![create-pr skill — step 2](./docs/evidence/image-20260418173255306.png)
- [ ] **MCP Server usage** — session log or screenshot showing Glossary MCP server called during development
- [ ] **Agents usage** — session log, PR comment, or screenshot showing output from `security-reviewer`, `code-reviewer`, `test-writer`, etc.

  - code-reviewer:

    ![code-reviewer agent output](./docs/evidence/image-20260418172430290.png)

  - test-writer (called in `start-issue` skill)

    ![test-writer agent output](./docs/evidence/image-20260418223933106.png)

## Parallel Development

- [ ] **Git worktree usage** — screenshot or `git worktree list` output showing parallel branches
- [ ] **2+ features in parallel** — `git branch --all` or git graph screenshot

## Writer/Reviewer Pattern

- [x] **2+ PRs** with C.L.E.A.R. review visible in PR comments
  - [#45](https://github.com/UchihaSusie/bookbridge/pull/45) — Auth-aware landing page
  - [#48](https://github.com/UchihaSusie/bookbridge/pull/48) — fix: PDF upload dropzone click
  - [#39](https://github.com/UchihaSusie/bookbridge/pull/39) — feat: PDF upload API route

## Testing & TDD

- [ ] **`git log --oneline`** showing each `test(red):` commit SHA before its `feat(next):` SHA — one entry per feature (3 total)

  ```bash
   git log --oneline | grep -E "test\(red\)|feat\(next\)"
  5bbaab3 feat(next): fix PDF upload dropzone click handler (ref #47)
  3cca656 test(red): failing tests for PDF upload dropzone click handler (ref #47)
  1dd0127 feat(next): implement auth-aware landing page (ref #44)
  57ea257 test(red): failing tests for auth-aware landing page (ref #44)
  d164b5d feat(next): implement GET /api/jobs/[jobId] polling proxy (ref #31)
  07132a7 test(red): failing tests for job polling proxy GET /api/jobs/[jobId] (ref #31)
  9905265 feat(next): implement full Next.js app with Clerk auth, Prisma PostgreSQL, 6 API routes, 6 pages
  7c2d8c9 test(red): failing tests for FastAPI worker endpoints (issue #16)
  0440a0e test(red): add failing tests for quality checker module
  bccb5b6 test(red): add failing tests for glossary store module
  3f40118 test(red): add 8 failing tests for extract_body_content HTML parser
  0dcc44c test(red): add 15 failing tests for chunker chapter detection and manifest (ref #3)
  e14bac8 test(red): add failing tests for text cleaning functions (ref #2)
  ```

  
- [ ] **Coverage report** — `npx vitest run --coverage` output showing ≥70%

  

## CI/CD & Deployment

- [ ] **Preview deploy URL** — Vercel per-PR preview link
- [ ] **Production deploy URL** — Vercel main branch deploy

## Documentation & Demo

- [ ] **Published blog post** — URL (Medium / dev.to)
- [ ] **Video demo** — link (5–10 min, showing app + Claude Code workflow)
- [ ] **Individual reflections** — submitted (500 words each, one per partner)
- [ ] **Showcase submission** — Google Form confirmation screenshot
