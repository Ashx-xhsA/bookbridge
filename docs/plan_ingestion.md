# Plan: Ingestion Module Architecture

Based on findings in `docs/explore_ingestion.md`, here is the implementation plan
for refactoring `legacy/split_book.py` into `bookbridge/ingestion/`.

## Step 1: Project Scaffold
Create the project structure:
- `pyproject.toml` with dependencies (pdfplumber, typer, rich, pytest, ruff)
- `bookbridge/__init__.py`
- `bookbridge/cli.py` with typer app stub
- `bookbridge/config.py` with project configuration dataclass
- `bookbridge/ingestion/__init__.py`
- `tests/__init__.py`

## Step 2: Port PDF Reader
Create `bookbridge/ingestion/pdf_reader.py`:
- Port `is_noise_line()`, `is_running_header()`, `clean_page_text()`, `is_noise_page()`
  directly from legacy code (these are well written pure functions)
- Port `extract_pages()` but make it accept `Path` parameter instead of hardcoded path
- Add configurable header patterns (default set plus user extensible)
- Add type hints on all signatures

## Step 3: Build Smart Chunker
Create `bookbridge/ingestion/chunker.py`:
- `detect_chapter_breaks(pages: dict[int, str]) -> set[int]`
  Uses regex to find structural markers: "PART ONE", "Chapter 1", "PROEM", etc.
- `build_chunk_manifest(pages, max_pages_per_chunk) -> ChunkManifest`
  Splits pages into chunks at detected chapter boundaries,
  respecting max size limit, ensuring all pages are covered

Create `bookbridge/ingestion/models.py`:
- `ChunkInfo` dataclass: chunk_id, title, start_page, end_page, page_count
- `ChunkManifest` dataclass: source_file, total_pages, chunks list
  with `to_json()` and `from_json()` serialization

## Step 4: Wire CLI
Update `bookbridge/cli.py`:
- Add `scan` command: accepts PDF path, runs extract_pages + build_chunk_manifest
- Output manifest as JSON to stdout or file
- Use rich for progress display

## Dependencies
- pdfplumber (PDF text extraction)
- typer (CLI framework)
- rich (terminal UI)
- pytest (testing)
- ruff (linting/formatting)
