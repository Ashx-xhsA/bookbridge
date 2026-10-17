---
name: Project Status
description: Current sprint state, what's done, and what's outstanding for BookBridge
type: project
originSessionId: ae71720d-723e-4976-9757-949aa587f099
---

Sprint 4 demo loop is complete; Sprint 3 backlog coverage still being filled in (as of 2026-04-18 evening). Reader-view end-to-end wiring (#51, PR #54) merged earlier this date. Currently working through Sprint 3 CRUD API issues — #29 (Projects CRUD) in flight on PR #55; #30 (Glossary CRUD) still open.

**Why:** The demo-able loop (upload PDF → Start Reading → Translate → dual-column reader) already works. The remaining Sprint 3 issues are BFF API completeness items — graded for rubric coverage (TDD pairs, OWASP gates, C.L.E.A.R. reviews) rather than for the demo narrative.

**How to apply:** Focus remaining work on (a) finishing the Sprint 3 CRUD issues that still have acceptance criteria unclaimed by any PR, (b) evidence collection, (c) deployment (Vercel + Railway), and (d) the video/blog artefacts. Don't add new features — the loop is complete.

## What's done

- Python core: ingestion, glossary, quality checker, MCP server, harness (mock / mymemory / claude-stub providers)
- Worker `/parse` populates `ChunkData.content` per chunk; `/translate/chunk` runs the harness synchronously
- Next.js BFF: `/api/upload` writes `sourceContent`, `/api/jobs` is synchronous with idempotency + `$transaction` atomicity + whitespace / worker-5xx / empty-source guards, `/read/[id]` auth + owner-or-public gate, dashboard Start Reading button
- CI: `ci.yml`, `security.yml`, Gitleaks, npm audit, Claude AI PR review
- Claude Code config: 3 hooks, 4 skills (`start-issue`, `create-pr`, `tdd-add-module`, `tdd-add-module-v1`), 5 agents, `.mcp.json`
- 5+ clean `test(red):` → `feat(green):` TDD pairs in git history (#44, #47, #51, #52, …)
- 5 PRs with C.L.E.A.R. reviews in comments (#39, #40, #45, #48, #54)
- `EVIDENCE.md` in repo root, linked from README

## In flight

- **PR #55** (issue #29 — S3-4 Projects CRUD) — open as of 2026-04-18, 6 commits: two full TDD cycles (API + Delete UI), refactor extracting `requireProjectOwner` guard, `fix(next):` commit addressing the code-reviewer agent's C.L.E.A.R. review (MUST FIX + actionable SHOULD CONSIDER). Scope deliberately expanded beyond the issue's "BFF API only" files to include the `DeleteProjectButton` UI so the feature is shippable end-to-end. Awaiting teammate re-review + merge. Manual browser verification still needed (the code-reviewer agent cannot drive the UI).
- **PR #54** (issue #51) — previously in flight; status should be re-checked (may have merged since this file was last updated).

## Open Sprint 3 backlog

- **Issue #30** — S3-5 BFF API Glossary CRUD (GET/POST/PATCH/DELETE `/api/projects/[id]/glossary`). Same pattern as #29; `requireProjectOwner` helper from PR #55 is a ready-made dependency once #55 merges.

## Still needed for rubric

- Vercel deployment (preview + production URLs)
- Railway worker deployment (production URL)
- Coverage report ≥70% screenshot
- Git log screenshot showing TDD pairs
- Worktree parallel development evidence
- MCP server, agents, skills usage screenshots
- Sprint 2/3/4 retrospective docs
- Blog post, video demo, individual reflections
