---
name: Evidence Collected
description: Rubric grading evidence already gathered — PR links, commit SHAs, file locations
type: project
originSessionId: ae71720d-723e-4976-9757-949aa587f099
---
## Writer/Reviewer Pattern — C.L.E.A.R. PRs (DONE)
5+ qualifying PRs (rubric needs 2+):
- https://github.com/UchihaSusie/bookbridge/pull/39 — PDF upload API route
- https://github.com/UchihaSusie/bookbridge/pull/40 — enhanced translation job queue tests
- https://github.com/UchihaSusie/bookbridge/pull/45 — auth-aware landing page
- https://github.com/UchihaSusie/bookbridge/pull/48 — PDF upload dropzone click fix
- https://github.com/UchihaSusie/bookbridge/pull/55 — S3-4 Projects CRUD (API + Delete UI). Particularly strong evidence: full `test(red) → feat(green) → refactor → fix` cycle PLUS a second `test(red) → feat(next)` cycle for the UI wiring, AND the C.L.E.A.R. review comment from the code-reviewer agent drove a `fix(next):` commit addressing every MUST FIX item.

## TDD Git Pairs (DONE — needs screenshot)
6+ clean pairs in git log (rubric needs 3+):
- `07132a7` test(red) → `d164b5d` feat(next): GET /api/jobs/[jobId]
- `57ea257` test(red) → `1dd0127` feat(next): auth-aware landing page
- `3cca656` test(red) → `5bbaab3` feat(next): PDF upload dropzone click
- `7c2d8c9` test(red) → `9905265` feat(next): full Next.js app bootstrap
- `5307559` test(red) → `9e397fb` feat(next): PATCH + DELETE /api/projects/[id]  (PR #55)
- `cfb9992` test(red) → `35ab86c` feat(next): DeleteProjectButton UI  (PR #55)

Screenshot command: `git log --oneline | grep -E "test\(red\)|feat\(next\)"`

## EVIDENCE.md
Located at repo root: `EVIDENCE.md`, linked from `README.md` line 2.

**Why:** Rubric grader needs visible artefacts; EVIDENCE.md is the single source of truth for collected links/screenshots.

**How to apply:** Update EVIDENCE.md checkboxes as each screenshot or link is collected.
