# HW5 Retrospective: Custom Skill + MCP Integration

## 1. How the Custom Skill Changed My Workflow

Before creating the `tdd-add-module` skill, every new module required me to
re-explain the full TDD workflow to Claude Code: what conventions to follow,
how to structure tests, when to commit, what prefixes to use. This was
repetitive and error-prone -- I would sometimes forget to mention the
`to_dict()` convention on dataclasses or the `pathlib.Path` requirement, and
Claude Code would produce inconsistent results.

The skill changed this fundamentally. By encoding the TDD workflow, project
conventions, and constraints into a single markdown file, I turned a 10-minute
setup conversation into a one-line reference. The skill became a "recipe" that
Claude Code could follow without me repeating instructions.

The v1 to v2 iteration was particularly revealing. When I tested v1 on the
glossary module, I identified four manual decisions I had to make that the skill
should have guided: SQLite test fixtures, dependency management, error handling
patterns, and post-implementation checks. After incorporating these into v2, the
quality module build was noticeably smoother.

Quantifying the difference:
- **v1 (glossary module):** 4 manual interventions needed during the TDD cycle.
  No pre-flight context loading. No definition of done -- I had to decide when
  the module was "complete."
- **v2 (quality module):** 0 manual interventions. Pre-flight checklist caught that
  `docs/API_DESIGN.md` already had the exact method signatures. Fixture patterns
  eliminated repeated boilerplate. Definition of Done checklist ensured all quality
  gates were met before committing.

The tasks that became easier: creating consistent module structures, writing tests
with proper fixtures, maintaining commit discipline with the red/green/refactor
pattern, and knowing when a module is truly done.

## 2. What MCP Integration Enabled

Before MCP, the glossary database was a black box. Terms lived in SQLite, and
interacting with them required writing Python code or running raw SQL queries.
During a translation session, if I needed to check whether "Ariekei" already had
an approved translation, I would have to exit the conversation, open a Python
shell, query the database, copy the result, and paste it back. This context
switching was disruptive and slow.

The Glossary MCP Server changed this by making the database a live resource within
the Claude Code workflow. Now Claude Code can:

1. **Query terms before translation:** Call `lookup_terms(chunk_id=3, target_lang="zh-Hans")`
   to get every term with its approved translation, then inject those directly into
   the translation prompt for consistency.

2. **Register new terms during discovery:** When Claude encounters a new proper noun
   during translation, it calls `add_term("new_term", "category", "context")` to
   register it immediately, without breaking the translation flow.

3. **Search for consistency:** After translating a chapter, `search_glossary("embassy")`
   finds all related terms to verify consistent usage across the book.

4. **Persist across sessions:** Because the glossary lives in SQLite (not in conversation
   context), it accumulates knowledge over time. A term added while translating Chapter 1
   is automatically available when translating Chapter 15, even weeks later.

The key insight is that MCP turns static data into a "live" tool that the AI can
interact with naturally. Instead of me being the intermediary between Claude Code
and the database, Claude Code talks to the database directly through well-defined
tool interfaces.

## 3. What I Would Build Next

### Hooks

- **PreCommit hook:** Automatically run glossary consistency checks before every commit.
  If a translation file is being committed, verify all known terms use their approved
  translations. This catches inconsistencies before they enter the repository.

- **PostToolUse hook (enhanced):** Beyond the current ruff autoformat hook, add a hook
  that validates translation quality scores after any write to a translation file.
  If the quality score drops below a threshold, warn the developer before proceeding.

### Sub-agents

- **Translation sub-agent:** A dedicated agent that handles chunk translation
  autonomously. It would: (1) call `lookup_terms` via MCP to get the glossary,
  (2) compose the translation prompt with skill-defined conventions, (3) translate
  the chunk, (4) run the quality checker, and (5) retry with feedback if quality
  is below threshold. This turns translation from a manual multi-step process into
  a single "translate chunk 5 into Chinese" command.

- **Glossary extraction sub-agent:** An agent that reads a new source document
  and populates the glossary automatically using NLP (spaCy named entity recognition)
  combined with LLM classification. It would identify proper nouns, categorize them,
  and suggest translations -- all without human intervention for the first pass.

### More Skills

- **`/translate-chapter`:** Orchestrates end-to-end chapter translation: load glossary,
  translate each paragraph, run quality checks, assemble output, commit results. A
  single command that replaces the current multi-step manual process.

- **`/review-translation`:** Quality review skill that reads a completed translation,
  runs all quality checks (completeness, glossary consistency, language-specific),
  produces a scored report, and suggests specific improvements with before/after
  examples.

### More MCP Servers

- **Translation MCP Server:** Expose `translate_chunk` and `check_quality` as MCP
  tools, making the entire translation pipeline accessible from any MCP client, not
  just the CLI. This is already designed in the BookBridge architecture plan.

- **Progress MCP Server:** Expose `get_progress`, `list_chunks`, and `get_chunk_status`
  to give Claude Code real-time visibility into which chapters are translated, their
  quality scores, and what remains to be done.
