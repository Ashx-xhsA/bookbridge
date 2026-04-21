# Sprint 2 Retrospective

Sprint covered: 2026-04-17 through submission. Planning doc: [`sprint-2-planning.md`](sprint-2-planning.md).

In practice Sprint 2 absorbed most of the Sprint 3 (feature completion) and Sprint 4 (reading view + polish) scope from the original PRD plan, because the fixed homework deadline compressed the four-sprint schedule.

## What Went Well

- **TDD pairs shipped at high cadence.** 11 new `test(red):` → `feat(*):` pairs landed across 4 active days (Apr 17-20), covering:
  - FastAPI worker endpoints (#16)
  - `bookbridge.harness` + `/translate/chunk` contract (#52)
  - `/api/projects/[id]` CRUD — PATCH + DELETE (#29)
  - `DeleteProjectButton` UI (#29)
  - Publish / unpublish `publicToken` generation (#24)
  - Public reading routes (#32)
  - Publish toggle + public reader page (#57)
  - Auth-aware landing page (#44)
  - PDF upload dropzone click fix (#47)
  - `GET /api/jobs/[jobId]` polling proxy (#31)
  - Reader view end-to-end (#51)
  - OpenAI-compatible translator provider (#60)
  - Async jobs / Vercel 10 s timeout (#61 — red phase only, still in flight at submission)
- **Sub-agents produced a durable review trail even without a second human reviewer.** The `code-reviewer` agent runs at Step 7 of the `/create-pr` skill on every PR, posting a full `## MUST FIX` / `## SHOULD CONSIDER` / `## C.L.E.A.R. SUMMARY` comment. Given that the partner-level review workflow on this project was limited to merge-clicks (see report §5.4), the AI-authored review comment became the de-facto review of record — consistent with the rubric's "one agent writes, another reviews" framing.
- **Playwright MCP closed the "AI can't see the UI it just changed" loop.** A complete session is archived at [`docs/evidence/mcp-playwright/`](evidence/mcp-playwright/) showing Claude moving a button, opening a Clerk-authenticated browser, and visually confirming the new layout in under 1 minute.
- **Security gates scaled cheaply.** An 86-line `.github/workflows/security.yml` runs Bandit (Python SAST), Semgrep (JS/TS SAST with `p/owasp-top-ten`), Gitleaks on `main`, and `npm audit` — and posts a summary PR comment automatically.
- **Coverage hit Excellent on both layers.** Vitest 86.9% statements / Python 77% — both above the 70% rubric threshold. Raw output in [`docs/evidence/coverage/`](evidence/coverage/).
- **Two-worktree setup** (`bookbridge/` on the code branch + `bookbridge-docs/` on `docs/report`) let the two partners work in parallel on code and submission docs without `git stash`/checkout churn.

## What Didn't Go Well

- **Vercel ↔ GitHub integration was not fully verified by submission.** The preview-deploy URL pattern and production deploy status check need to be confirmed and screenshotted — tracked as a TODO in [report §4.1 rows 7-8](report.md).
- **Issue #61 (async jobs / Vercel 10 s timeout) didn't reach green before the deadline.** The red-phase test files (`jobs-async.test.ts`, `route-async.test.ts`) are committed with `// THE FAILING ASSERTION:` markers — honest TDD-in-progress, but means translation endpoints still use synchronous dispatch in production.
- **Playwright MCP required manual sign-in** — Clerk redirects the controlled browser to its hosted sign-in, and we chose not to commit test credentials. Full E2E automation in CI is wired up (`bookbridge-next/e2e/landing.spec.ts`), but the MCP-driven UI-verification loop needs a human to sign in once per session.
- **Two-worktree coordination had sharp edges.** When both IDEs had the Source Control panel open on the same branch, we had to be careful not to edit the same branch from both places. Resolved by locking each worktree to a specific branch (`bookbridge/` → `docs/submission-evidence`, `bookbridge-docs/` → `docs/report`).
- **No dedicated async standup channel was maintained.** The two partners took turns driving phases (Shuai Ren drove Sprint 1, Ash drove Sprint 2) rather than running a daily standup cadence. Partner-to-partner coordination beyond git + PR authorship was effectively absent — an honest rubric gap declared in report §5.4, not re-framed as something it wasn't.

## What We Learned

- **"Deploy First" as a sprint goal was exactly right.** Having CI/CD live from Sprint 2 start meant every subsequent feature was tested against the real deployment surface, not a local-only assumption.
- **Sub-agents belong inside skills, not as separate flows.** `/create-pr` Step 7 invoking `code-reviewer` made reviews happen automatically — nobody had to remember to do it.
- **Red-phase tests are useful even when they don't land green before a deadline.** They make TDD-in-progress visible, and they give the next contributor a concrete green target.
- **OWASP mapping in `CLAUDE.md` pays off every session.** Because the 10-row table loads at session start, every API route Claude wrote carried `auth()` + ownership checks + Zod validation by default — no re-prompting.
- **Two-worktree pattern scales.** One code worktree + one docs worktree avoids the usual "stash before switching branches" friction. Worth keeping for Sprint 3+.

## What to Carry Forward (Post-submission)

1. Finish issue #61 (async jobs / Vercel timeout) — turn the 7 red-phase tests green
2. Wire Vercel ↔ GitHub integration properly; replace the TODOs in report §4.1
3. Add a lightweight E2E auth strategy (test-only Clerk user or bypass) so Playwright MCP can run headless in CI
4. Publish blog post + record 5-10 min demo video (rubric Cat 6)
5. Add a `feat/issue-XX` template to `/start-issue` for consistent branch names
