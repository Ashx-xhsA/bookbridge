# Memory Index

- [User Profile](user_profile.md) — CS student, BookBridge pair project, comfortable with git/GitHub CLI
- [Project Status](project_status.md) — Sprint 4 demo loop done; Sprint 3 CRUD backlog in flight (PR #55 open)
- [Evidence Collected](evidence_collected.md) — Rubric evidence: 5+ C.L.E.A.R. PRs, 6+ TDD pairs
- [Workflow Preferences](workflow_preferences.md) — Concise responses; address full review list not just blockers; OK expanding PR scope for shippable UX
- [gh CLI Quirks](gh_cli_quirks.md) — `gh issue assign` unavailable locally (use `gh issue edit --add-assignee`); slash commands load from `.claude/commands/` (not `.claude/skills/`)
- [Legacy Files Churn](legacy_files_churn.md) — `legacy/merge.py` and `legacy/split_book.py` keep reappearing as modified; always discard before staging
- [Harness / Worker Provider Decisions](harness_provider_decisions.md) — demo=mock, real=openai_compat (universal OpenAI-format, covers OpenAI/DeepSeek/Moonshot/etc.); claude stub out of scope; mymemory unusable; macOS Py3.13 SSL fix; /parse vs /translate/chunk timeout split
