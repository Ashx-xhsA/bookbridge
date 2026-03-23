# BookBridge

BookBridge is an AI-powered translation system built for long documents like novels, textbooks, and research papers. It breaks documents into structured chunks, maintains a consistent glossary across the entire text, and produces bilingual or translation-only output.

This project started from a manual translation pipeline (see `legacy/`) and is being rebuilt as a modular, testable system using strict TDD and the Explore → Plan → Implement → Commit workflow.

## Quick Start

```bash
pip install -e ".[dev]"
pytest tests/ -v
```

## Project Structure

```
bookbridge/
├── CLAUDE.md                  # AI assistant context (tech stack, conventions, do's/don'ts)
├── .claude/
│   ├── settings.json          # Permissions and hooks config
│   └── skills/                # Custom Claude Code skills (HW5)
│       ├── tdd-add-module.md      # v2: TDD module builder with fixtures and DoD
│       └── tdd-add-module-v1.md   # v1: archived for iteration evidence
├── pyproject.toml             # Dependencies and project metadata
├── bookbridge/                # Main package
│   ├── cli.py                 # CLI entry point (typer)
│   ├── config.py              # Project configuration
│   ├── ingestion/             # PDF reading, text cleaning, smart chunking
│   │   ├── pdf_reader.py      # Page extraction and OCR noise removal
│   │   ├── chunker.py         # Chapter detection and manifest building
│   │   └── models.py          # ChunkInfo and ChunkManifest dataclasses
│   ├── glossary/              # Term storage for translation consistency
│   │   ├── store.py           # SQLite-backed GlossaryStore (CRUD + search)
│   │   └── models.py          # Term and Translation dataclasses
│   ├── quality/               # Per-language translation quality checks
│   │   ├── base.py            # BaseQualityChecker ABC (completeness, glossary)
│   │   ├── zh_hans.py         # Chinese Simplified checks (punctuation, stray English)
│   │   └── models.py          # Issue and QualityReport dataclasses
│   ├── mcp_servers/           # MCP servers for Claude Code integration
│   │   └── glossary_server.py # Glossary MCP: 5 tools + 1 resource
│   └── output/
│       └── html_parser.py     # HTML body content extraction
├── tests/                     # 81 tests, all passing
│   ├── test_pdf_reader.py     # 20 tests for text cleaning functions
│   ├── test_chunker.py        # 15 tests for chapter detection and chunking
│   ├── test_html_parser.py    # 8 tests for HTML extraction
│   ├── test_glossary.py       # 16 tests for glossary store (SQLite CRUD + search)
│   ├── test_quality.py        # 15 tests for quality checkers (base + Chinese)
│   └── test_mcp_glossary.py   # 7 tests for MCP server tools
├── docs/
│   ├── PRD.md                 # Product requirements and user personas
│   ├── API_DESIGN.md          # Internal module API specifications
│   ├── SESSION_LOG.md         # Annotated HW4 development session log
│   ├── explore_ingestion.md   # Exploration findings from legacy code
│   ├── plan_ingestion.md      # Implementation plan for ingestion module
│   ├── SKILL_ITERATION.md     # v1 → v2 skill changes with rationale
│   ├── SKILL_V1_SESSION.md    # Session log: skill v1 on glossary module
│   ├── SKILL_V2_SESSION.md    # Session log: skill v2 on quality module
│   ├── MCP_SETUP.md           # Glossary MCP server setup and usage guide
│   ├── MCP_DEMO_SESSION.md    # MCP demonstrated workflow session log
│   └── HW5_RETROSPECTIVE.md   # HW5 retrospective (skills, MCP, next steps)
└── legacy/                    # Original manual pipeline (read-only reference)
```

## What's Been Built

### Ingestion Pipeline (HW4)
Takes any English PDF and produces a structured chunk manifest:
- Extracts text page by page using pdfplumber
- Removes OCR noise and running headers
- Detects chapter boundaries (PART, Chapter, PROEM, EPILOGUE, etc.)
- Splits into right-sized chunks with metadata

### Glossary Store (HW5)
SQLite-backed term storage for translation consistency:
- Add, retrieve, list, and search glossary terms
- Store translations per term per language
- Case-insensitive partial-match search

### Quality Checker (HW5)
Per-language translation quality validation:
- Abstract `BaseQualityChecker` with completeness and glossary consistency checks
- `ChineseSimplifiedChecker` detecting half-width punctuation and untranslated English
- Aggregated `QualityReport` with issue tracking

### Glossary MCP Server (HW5)
Custom MCP server exposing the glossary database to Claude Code:
- **Tools:** `lookup_terms`, `add_term`, `add_translation`, `list_terms`, `search_glossary`
- **Resource:** `glossary://terms` (full glossary as JSON)
- Connect with: `claude mcp add glossary-server -- python -m bookbridge.mcp_servers.glossary_server --db glossary.db`

### Custom Skill: tdd-add-module (HW5)
Reusable Claude Code skill encoding the project's TDD workflow:
- Pre-flight checklist, dependency check, test fixture patterns
- Red/green/refactor commit conventions
- Definition of Done checklist
- Iterated from v1 → v2 based on real task testing

### HTML Parser
For reassembling translated chunk files into a single document.

## Running Tests

```bash
pytest tests/ -v --tb=short           # 81 tests
pytest tests/ --cov=bookbridge --cov-report=term
```

## MCP Server

See [docs/MCP_SETUP.md](docs/MCP_SETUP.md) for full setup instructions.

```bash
# Start the glossary MCP server
python -m bookbridge.mcp_servers.glossary_server --db glossary.db

# Connect to Claude Code
claude mcp add glossary-server -- python -m bookbridge.mcp_servers.glossary_server --db /path/to/glossary.db
```

## Development Workflow

This project follows the Claude Code recommended workflow:

1. **Explore** existing code (Glob, Grep, Read)
2. **Plan** the approach (save to docs/)
3. **Implement** the plan
4. **Commit** with clear, meaningful messages

TDD cycles use the `test(red):` → `feat(green):` → `refactor:` commit prefix convention.

New modules are added using the custom `.claude/skills/tdd-add-module.md` skill, which encodes the full TDD workflow with project-specific conventions.
