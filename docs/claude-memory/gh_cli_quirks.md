---
name: gh CLI Quirks
description: Local gh CLI lacks `gh issue assign`; use `gh issue edit --add-assignee @me` instead. Also: Claude Code slash commands live in .claude/commands/ (not .claude/skills/).
type: project
originSessionId: fbfa59fc-146c-4519-8462-547db214ae5a
---
## `gh issue assign` is not available locally

`gh issue assign <number> --repo ... @me` fails with `unknown command "assign" for "gh issue"` in the user's installed gh CLI version.

**Why:** The user's gh version does not ship the `assign` subcommand (available only on very recent gh versions).

**How to apply:**
- Always use `gh issue edit <number> --repo UchihaSusie/bookbridge --add-assignee @me`.
- Same substitution applies to any skill or doc that uses `gh issue assign`.

## Claude Code slash commands live in `.claude/commands/`, NOT `.claude/skills/`

As of 2026-04-20, `/start-issue`, `/create-pr`, `/tdd-add-module` load from `.claude/commands/*.md` only. The project used to keep them in `.claude/skills/` — those files are now ignored by Claude Code (they still exist but are dead). If a `/command` reports "Unknown command," first check whether the file exists in `.claude/commands/` and copy it over from `skills/` if missing.

**Current state (fixed 2026-04-20):**
- `.claude/commands/start-issue.md` — patched to use `gh issue edit --add-assignee @me` at Step 5
- `.claude/commands/create-pr.md` — copied from skills/, no patches
- `.claude/commands/tdd-add-module.md` — copied from skills/, no patches
- `.claude/skills/*.md` — still present but unused; safe to delete eventually but harmless to leave

**How to apply:** When the user invokes a `/<name>` that "doesn't exist," check `.claude/commands/` first. If a skill file at `.claude/skills/<name>.md` still references `gh issue assign`, don't bother patching it — the dead file will never be loaded.
