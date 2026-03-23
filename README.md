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
├── .claude/settings.json      # Permissions and hooks config
├── pyproject.toml             # Dependencies and project metadata
├── bookbridge/                # Main package
│   ├── cli.py                 # CLI entry point (typer)
│   ├── config.py              # Project configuration
│   ├── ingestion/             # PDF reading, text cleaning, smart chunking
│   │   ├── pdf_reader.py      # Page extraction and OCR noise removal
│   │   ├── chunker.py         # Chapter detection and manifest building
│   │   └── models.py          # ChunkInfo and ChunkManifest dataclasses
│   └── output/
│       └── html_parser.py     # HTML body content extraction
├── tests/                     # 43 tests, all passing
│   ├── test_pdf_reader.py     # 20 tests for text cleaning functions
│   ├── test_chunker.py        # 15 tests for chapter detection and chunking
│   └── test_html_parser.py    # 8 tests for HTML extraction
├── docs/
│   ├── PRD.md                 # Product requirements and user personas
│   ├── API_DESIGN.md          # Internal module API specifications
│   ├── SESSION_LOG.md         # Annotated development session log
│   ├── explore_ingestion.md   # Exploration findings from legacy code
│   └── plan_ingestion.md      # Implementation plan for ingestion module
└── legacy/                    # Original manual pipeline (read-only reference)
```

## What's Been Built So Far

**Ingestion pipeline** that takes any English PDF and produces a structured chunk manifest:
- Extracts text page by page using pdfplumber
- Removes OCR noise and running headers
- Detects chapter boundaries (PART, Chapter, PROEM, EPILOGUE, etc.)
- Splits into right-sized chunks with metadata

**HTML parser** for reassembling translated chunk files into a single document.

Everything was built with TDD. The git history shows clear red-green-refactor cycles across three feature branches (PRs #5, #6, #7), plus a full Explore → Plan → Implement → Commit workflow on PR #4.

## Running Tests

```bash
pytest tests/ -v --tb=short
pytest tests/ --cov=bookbridge --cov-report=term
```

## Development Workflow

This project follows the Claude Code recommended workflow:

1. **Explore** existing code (Glob, Grep, Read)
2. **Plan** the approach (save to docs/)
3. **Implement** the plan
4. **Commit** with clear, meaningful messages

TDD cycles use the `test(red):` → `feat(green):` → `refactor:` commit prefix convention.
