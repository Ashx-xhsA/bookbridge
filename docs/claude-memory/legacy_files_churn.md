---
name: Legacy Files Churn
description: legacy/merge.py and legacy/split_book.py repeatedly re-appear as modified during a session — discard before staging or pushing.
type: project
originSessionId: fbfa59fc-146c-4519-8462-547db214ae5a
---
Throughout a working session in this repo, `legacy/merge.py` and `legacy/split_book.py` repeatedly show up in `git status` as modified even after being discarded. Some local hook, formatter, or editor setup is touching them — the source of the churn has not been investigated.

**Why:** CLAUDE.md forbids modifying `legacy/` (it is a reference baseline). Any commit or push that includes these files would violate that rule and pollute PRs with irrelevant diffs. Past sessions have silently discarded them multiple times; the churn keeps coming back.

**How to apply:**
- Before `git add`, always run `git status` and if `legacy/merge.py` or `legacy/split_book.py` are modified, run `git checkout -- legacy/merge.py legacy/split_book.py` first.
- Never stage or commit those files without an explicit user instruction.
- If the user wants the root cause fixed, investigate pre-commit hooks / editor save actions / ruff-format scope — but do not attempt this without being asked, since it is environment-specific.
