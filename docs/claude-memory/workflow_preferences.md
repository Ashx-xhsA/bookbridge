---
name: Workflow Preferences
description: How the user likes to work with Claude Code on this project
type: feedback
originSessionId: ae71720d-723e-4976-9757-949aa587f099
---
Prefers concise, direct responses — no trailing summaries or long explanations unless asked.

**Why:** User can read diffs and output themselves; verbose narration wastes time.

**How to apply:** Keep text between tool calls to one sentence. End responses with one short sentence max.

Uses `gh` CLI for all GitHub interactions. Comfortable being pointed to run commands themselves via `! <command>` in the prompt.

---

On code review, addresses the **entire** review list — not just blocking items.

**Why:** Validated 2026-04-18. After the code-reviewer agent posted a C.L.E.A.R. review with 3 MUST FIX, 7 SHOULD CONSIDER, and 3 MINOR items, the user's instruction was "fix [the blocking items] and also fix this:" followed by the full review. They wanted comprehensive cleanup, not a minimum-viable fix. This matches an academic/rubric-driven workflow where thoroughness is graded.

**How to apply:** When a code review comes back, address every actionable item unless the reviewer explicitly marked it as "no change needed" or it contradicts a deliberate project decision. Group the response by blocking vs. non-blocking in the PR comment so the reviewer can still see the priority tiering.

---

Willing to expand a PR's scope beyond the issue's declared "Files to Modify" when the feature would otherwise be unshippable.

**Why:** Validated 2026-04-18 on PR #55 (issue #29). The issue's scope was "BFF API only" — listed only `app/api/projects/[id]/route.ts` as the file to modify. After merging the API, the user looked at their dashboard and asked "but I still don't see delete in my page." When offered options (1) keep PR API-only + file UI follow-up, (2) expand PR to include UI, or (3) separate PR off main, they chose (2).

**How to apply:**
- Before proposing a scope expansion, surface it explicitly and offer the narrow-scope alternative so the user still makes the call.
- Once approved, document the expansion in the commit message AND on the PR as a comment (not hidden inside the diff) so the reviewer knows the PR is deliberately broader than the issue implied.
- Still hold the line on unrelated refactors or speculative cleanup — "end-to-end user-facing feature in one PR" is the bar, not "grab-bag of improvements."
