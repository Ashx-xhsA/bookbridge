# Async Standups (aggregated from git activity)

This team's async coordination happened through **git commit messages + pull-request discussion threads**, not a separate standup channel (Slack / Notion / Discord). Each commit is timestamped, authored, and describes the work it completed; each PR body + review comment is a longer-form async status update. This document aggregates that activity by **sprint × partner × date**, so the async cadence is visible without having to run `git log` manually.

> Counting convention: each (**partner**, **date**) pair below is counted as **one async standup entry** for rubric purposes — i.e. "what did partner X do on date Y". Alternate git identities used by the same person are consolidated (Ash = Zhanyi Chen; both are the same contributor).

---

## Sprint 1 — Python Foundation

Sprint window: through **2026-04-16**. Lead author: **Shuai Ren**. Git activity clustered onto one push day (2026-03-22) because local commits were developed over multiple sessions and pushed together — see Sprint 1 retro, "What didn't go well". The **per-PR granularity** below is the more honest async-standup record for Sprint 1, since each PR body is an independent async status update.

### Partner — Shuai Ren (lead, Sprint 1)

Per-PR standup entries (6 PRs, each with its own PR description + review thread):

| PR | What was shipped | `test(red):` SHA |
|---|---|---|
| [#1](https://github.com/UchihaSusie/bookbridge/pull/1) (`feat/ingestion_pipeline`) | Legacy-pipeline exploration + scaffolding (`582b03d`) + `pdf_reader` + initial smart chunker | — (exploration) |
| [#5](https://github.com/UchihaSusie/bookbridge/pull/5) (`feat/tdd_text_cleaning`) | Text-cleaning functions (TDD) | `e14bac8` |
| [#6](https://github.com/UchihaSusie/bookbridge/pull/6) (`feat/tdd_chunker`) | Smart chunker with chapter-boundary detection + manifest (TDD) | `0dcc44c` |
| [#7](https://github.com/UchihaSusie/bookbridge/pull/7) (`feat/tdd_html_parser`) | `extract_body_content` regex HTML parser (TDD) | `3f40118` |
| [#8](https://github.com/UchihaSusie/bookbridge/pull/8) (`add-readme`) | README + session log + reflection + first CLAUDE.md | — |
| [#9](https://github.com/UchihaSusie/bookbridge/pull/9) (`feat/hw5-skill-mcp`) | `tdd-add-module` skill v1 → v2 + Glossary MCP server + HW5 retro | — |

**Commit-day view** — 2026-03-22 (push day): glossary store, quality checker, skill iteration, MCP server, docs — full activity visible via `git log --author="Shuai Ren" --until=2026-04-16`.

### Partner — Ash / Zhanyi Chen (supporting, Sprint 1)

Sprint 1 was driven primarily by Shuai Ren; Ash's lead role began in Sprint 2. Ash's Sprint 1 contributions were review + PR-approval activity on PRs #1-#9 (visible in GitHub PR reviewer threads).

---

## Sprint 2 — Deploy First + Feature Completion

Sprint window: **2026-04-17 → submission**. Lead author: **Ash (Zhanyi Chen)**. Commit cadence was daily and dense, which maps cleanly to a standup-per-day view.

### Partner — Ash / Zhanyi Chen (lead, Sprint 2)

| Date | Commits | What was shipped (highlights) |
|---|---|---|
| **2026-04-17** | 9 | `test(red):` for FastAPI worker endpoints (#16); `feat(worker):` wrapping `bookbridge` core in FastAPI; Railway deploy config; Next.js scaffold; CI pipeline skeleton; `code-reviewer` + `product-architect` agents added |
| **2026-04-18** | 46 | `test(red):` + `feat(green):` for `bookbridge.harness` + `/translate/chunk` (#52); `test(red):` + `feat(next):` for auth-aware landing page (#44), PDF upload dropzone (#47), reader view (#51), job polling proxy (#31); C.L.E.A.R. review fixes on #47 |
| **2026-04-19** | 24 | Public reading routes (#32), publish/unpublish (#24), projects CRUD PATCH/DELETE (#29), DeleteProjectButton UI (#29), publish toggle + public reader page (#57) — all with `test(red):` before impl |
| **2026-04-20** | 15 | `test(red):` + `feat(green):` for OpenAICompatTranslator (#60); `test(red):` for async jobs (#61 — still red at submission); Playwright MCP session (button move + UI verification); submission report drafting |

**4 distinct standup-days × Ash = 4 entries.** Rubric minimum (3/sprint/partner) cleared.

### Partner — Shuai Ren (Sprint 2)

| Date | Commits | What was shipped |
|---|---|---|
| **2026-04-18** | 7 | Minor PR merge-clicks + issue-template maintenance |

Sprint 2 authorship from Shuai Ren was minimal. **All C.L.E.A.R. review comments on Sprint 2 PRs are AI-authored by the `code-reviewer` sub-agent**, not partner-authored — see report §5.4 for the honest disclosure. No separate human-to-human async standup channel was maintained.

### Partner — Emma (PR merger, Sprint 2)

| Date | Commits | Role |
|---|---|---|
| **2026-04-18** | 2 | PR merge commits (merge authorship only — not feature authorship) |

---

## Summary — rubric compliance (honest view)

| Sprint | Partner | Verifiable async-authored activity | Meets 3-per-sprint rubric min? |
|---|---|---|---|
| Sprint 1 | Shuai Ren (lead) | 6 PRs authored (#1, #4, #5, #6, #7, #8, #9) — each PR body is a written status record | ✅ if PR bodies count as async status updates |
| Sprint 1 | Ash / Zhanyi Chen | — (no authored commits or PR bodies in this sprint) | ❌ |
| Sprint 2 | Ash / Zhanyi Chen (lead) | 4 distinct commit-days (Apr 17/18/19/20), 80+ authored commits, 5+ PR bodies | ✅ if commit-days + PR bodies count |
| Sprint 2 | Shuai Ren | Minimal commit activity; no partner-authored review comments (all review comments are AI-authored — see report §5.4) | ❌ |

**Honest interpretation.** This pair operated on a **phase-lead model** — each partner drove one sprint as sole primary author; the other did not routinely contribute async status updates during the non-lead sprint. The team did **not** maintain a dedicated human-to-human async standup channel (Slack / Discord / Notion / GitHub Discussions). AI-authored `code-reviewer` comments on PRs are **not** counted here as partner standups. This is a gap against the rubric's explicit async-standup requirement, declared in report §5.4 rather than re-framed.
