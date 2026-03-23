# Exploration Findings: Legacy Ingestion Pipeline

## Overview
Explored `legacy/split_book.py` and `legacy/merge.py` to understand the existing
translation pipeline before refactoring into `bookbridge/ingestion/`.

## split_book.py Analysis

### PDF Reading (lines 95-116)
- Uses `pdfplumber` to extract text from each page
- Returns `dict[int, str]` mapping page numbers to cleaned text
- Applies `clean_page_text()` then `is_noise_page()` to filter garbage pages
- Noise pages are replaced with empty strings

### Text Cleaning Functions (lines 56-92)
Four pure functions that form the cleaning pipeline:

1. **`is_noise_line(line)`** (line 56): Checks if a line is OCR garbage.
   Returns True if line has < 3 characters OR alpha ratio < 0.3.
   Empty strings return False.

2. **`is_running_header(line)`** (line 67): Matches 4 regex patterns for
   running headers: author name variations ("CHINA MIEVILLE" with OCR errors),
   book title ("EMBASSYTOWN" with OCR spacing), numbered page headers.

3. **`is_noise_page(text)`** (line 71): A page is noise if >60% of its
   non empty lines are noise lines. Empty pages return True.

4. **`clean_page_text(text)`** (line 80): Removes running headers, replaces
   tabs with spaces, collapses multiple spaces, strips result.

### Chunk Definition (lines 18-44)
- **Hardcoded**: 25 chunks defined as tuples with (num, filename, start_page,
  end_page, description)
- Page ranges are manually assigned based on the specific book structure
- This is NOT reusable for other books

### Header Patterns (lines 46-51)
- 4 compiled regex patterns stored in `RUNNING_HEADER_PATTERNS`
- Handle OCR variations of author name and book title
- These are book specific but the pattern matching approach is reusable

### Constants
- `NOISE_THRESHOLD = 0.6` controls when a page is considered garbage

## merge.py Analysis

### extract_body_content (line 166)
- Extracts content from bilingual HTML chunks
- Handles full HTML documents (extracts between body tags) and raw fragments
- Strips DOCTYPE, html, head tags from fragments
- This is a useful utility to port

### Output Format
- Expects `chunk_XX_bilingual.html` files with `page-en` and `page-zh` divs
- Generates a single HTML with TOC navigation, styled sections
- Uses Python string formatting (not Jinja2 templates)

## Key Findings for Refactoring

### What to keep
- The 4 text cleaning functions are solid and testable
- The `extract_pages()` flow (read PDF, clean pages, filter noise) is correct
- The `extract_body_content()` regex approach works well

### What to change
- Replace hardcoded chunk definitions with automatic chapter detection
- Accept any PDF path instead of hardcoded `Embassytown_english.pdf`
- Use `pathlib.Path` instead of `os.path`
- Add type hints throughout
- Use dataclasses for structured output (ChunkManifest, ChunkInfo)
- Replace `print()` with `rich.console` or logging
- Make header patterns configurable (not just Embassytown specific)

### Proposed Module Split
- `pdf_reader.py`: extract_pages, is_noise_line, is_running_header,
  clean_page_text, is_noise_page
- `chunker.py`: detect_chapter_breaks, build_chunk_manifest
- `models.py`: ChunkInfo, ChunkManifest dataclasses
