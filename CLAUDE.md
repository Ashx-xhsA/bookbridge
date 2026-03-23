# BookBridge: Skill Driven Book Translation System

## Project Overview
BookBridge automates long document translation with glossary consistency,
quality checking, and MCP integration. It replaces isolated, single prompt
translation with a structured pipeline: ingest, extract terminology, translate
with enforced consistency, and assemble polished output.

## Tech Stack
- Language: Python 3.11+
- PDF extraction: pdfplumber
- NLP: spaCy (en_core_web_sm) for named entity recognition
- LLM: Anthropic Claude API (anthropic SDK)
- Vector store: ChromaDB for glossary RAG retrieval
- Database: SQLite (stdlib sqlite3) for glossary and progress state
- MCP: mcp Python SDK for server development
- CLI: typer + rich for terminal UI
- Templates: Jinja2 for HTML output
- Testing: pytest + pytest_cov
- Formatting: ruff (linter + formatter)

## Architecture Decisions
- Monolith with clear module boundaries (translation is I/O bound, not compute bound)
- SQLite for glossary + progress state (portable, zero config, no server needed)
- ChromaDB for semantic glossary retrieval (embed terms for RAG injection at translation time)
- Skills as plain .md files (user extensible without code changes)
- MCP servers expose glossary and translation as tools for Claude Code integration
- Strict TDD: tests written before implementation for all core modules

## Project Structure
bookbridge/
  bookbridge/          # main package
    cli.py             # typer CLI entry point
    config.py          # project level config and language registry
    ingestion/         # PDF reading, chunking, term extraction
    glossary/          # SQLite + ChromaDB glossary storage
    skills/            # .md skill files + SkillManager loader
    harness/           # translation orchestrator, context engineering, LLM client
    quality/           # per language quality checkers
    mcp_servers/       # glossary and translation MCP servers
    output/            # HTML assembler + Jinja2 templates
  tests/               # pytest test suite
  docs/                # PRD, API design, exploration notes
  legacy/              # original manual pipeline for reference

## Coding Conventions
- Type hints on ALL function signatures (enforced by ruff)
- Dataclasses for structured data (no raw dicts for domain objects)
- Functions under 40 lines; extract helpers when longer
- pathlib.Path preferred over os.path for all new code
- Google style docstrings on all public functions
- Imports sorted by ruff (isort compatible)

## Testing Strategy
- pytest as test runner, pytest_cov for coverage
- TDD workflow: write failing test, implement to pass, refactor
- Unit tests for all pure functions (cleaning, parsing, chunking)
- Test fixtures in tests/fixtures/ for sample text and HTML
- Integration tests for CLI using typer.testing.CliRunner
- Target: 80%+ coverage on ingestion/ and quality/ modules

## Do's
- Write tests BEFORE implementation (strict TDD)
- Use dataclasses for all structured data (ChunkManifest, ChunkInfo, Term)
- Keep modules importable independently (no circular imports)
- Handle edge cases: empty pages, OCR garbage, missing files, unicode
- Use /clear between workflow phases to manage context
- Commit with conventional prefixes: test(red):, feat(green):, refactor:

## Don'ts
- Don't hardcode file paths (accept via CLI args or config)
- Don't use print() for user output (use rich.console or logging)
- Don't store API keys in code (use environment variables)
- Don't modify files in legacy/ (that is the reference baseline)
- Don't let AI write tests (humans write test specs, AI implements code)

@import docs/PRD.md
@import docs/API_DESIGN.md
