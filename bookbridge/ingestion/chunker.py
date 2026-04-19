"""Smart document chunker with chapter boundary detection.

Detects structural boundaries (parts, chapters, prologues) in page text
and splits documents into manageable chunks for translation.
"""

import re

from bookbridge.ingestion.models import ChunkInfo, ChunkManifest

CHAPTER_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"^\s*PART\s+(ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|\d+)", re.IGNORECASE),
    re.compile(r"^\s*Chapter\s+\d+", re.IGNORECASE),
    re.compile(r"^\s*PROEM\b", re.IGNORECASE),
    re.compile(r"^\s*EPILOGUE\b", re.IGNORECASE),
    re.compile(r"^\s*PROLOGUE\b", re.IGNORECASE),
    re.compile(r"^\s*APPENDIX\b", re.IGNORECASE),
]

HEADER_SCAN_LINES: int = 3
MAX_TITLE_LENGTH: int = 80


def _has_chapter_marker(text: str) -> bool:
    """Check if a page's opening lines contain a chapter marker."""
    first_lines = text.strip().split("\n")[:HEADER_SCAN_LINES]
    return any(pattern.search(line) for line in first_lines for pattern in CHAPTER_PATTERNS)


def detect_chapter_breaks(pages: dict[int, str]) -> set[int]:
    """Find page numbers where new chapters or structural sections begin.

    Scans the first few lines of each page for structural markers
    like 'PART ONE', 'Chapter 3', 'PROEM', etc.
    """
    return {
        page_num for page_num, text in pages.items() if text.strip() and _has_chapter_marker(text)
    }


def build_chunk_manifest(
    pages: dict[int, str],
    max_pages_per_chunk: int = 20,
    source_file: str = "",
) -> ChunkManifest:
    """Build a chunk manifest by splitting pages at chapter boundaries.

    Prefers splitting at detected chapter boundaries. Falls back to
    splitting at max_pages_per_chunk when no boundary is nearby.
    """
    if not pages:
        return ChunkManifest(source_file=source_file, total_pages=0, chunks=[])

    sorted_pages = sorted(pages.keys())
    breaks = detect_chapter_breaks(pages)

    chunks: list[ChunkInfo] = []
    chunk_id = 1
    chunk_start = sorted_pages[0]

    for i, page_num in enumerate(sorted_pages):
        pages_in_chunk = page_num - chunk_start + 1
        is_last = i == len(sorted_pages) - 1
        next_is_break = not is_last and sorted_pages[i + 1] in breaks
        at_size_limit = pages_in_chunk >= max_pages_per_chunk

        if is_last or next_is_break or at_size_limit:
            title = _extract_title(pages, chunk_start)
            chunks.append(
                ChunkInfo(
                    chunk_id=chunk_id,
                    title=title,
                    start_page=chunk_start,
                    end_page=page_num,
                    page_count=pages_in_chunk,
                )
            )
            chunk_id += 1
            if not is_last:
                chunk_start = sorted_pages[i + 1]

    return ChunkManifest(
        source_file=source_file,
        total_pages=len(pages),
        chunks=chunks,
    )


def _extract_title(pages: dict[int, str], start_page: int) -> str:
    """Extract a title from the first page of a chunk."""
    text = pages.get(start_page, "")
    if not text.strip():
        return f"Chunk starting at page {start_page}"
    first_line = text.strip().split("\n")[0].strip()
    if not first_line:
        return f"Chunk starting at page {start_page}"
    if len(first_line) > MAX_TITLE_LENGTH:
        return first_line[: MAX_TITLE_LENGTH - 3] + "..."
    return first_line
