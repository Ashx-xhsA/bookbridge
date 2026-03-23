"""Smart document chunker with chapter boundary detection."""

import re

from bookbridge.ingestion.models import ChunkInfo, ChunkManifest

CHAPTER_PATTERNS: list[re.Pattern] = [
    re.compile(r"^\s*PART\s+(ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|\d+)", re.IGNORECASE),
    re.compile(r"^\s*Chapter\s+\d+", re.IGNORECASE),
    re.compile(r"^\s*PROEM\b", re.IGNORECASE),
    re.compile(r"^\s*EPILOGUE\b", re.IGNORECASE),
    re.compile(r"^\s*PROLOGUE\b", re.IGNORECASE),
    re.compile(r"^\s*APPENDIX\b", re.IGNORECASE),
]


def detect_chapter_breaks(pages: dict[int, str]) -> set[int]:
    """Find page numbers where new chapters or structural sections begin.

    Scans the first few lines of each page for patterns like
    'PART ONE', 'Chapter 3', 'PROEM', etc.
    """
    breaks: set[int] = set()
    for page_num, text in sorted(pages.items()):
        if not text.strip():
            continue
        first_lines = text.strip().split("\n")[:3]
        for line in first_lines:
            if any(p.search(line) for p in CHAPTER_PATTERNS):
                breaks.add(page_num)
                break
    return breaks


def build_chunk_manifest(
    pages: dict[int, str],
    max_pages_per_chunk: int = 20,
    source_file: str = "",
) -> ChunkManifest:
    """Build a chunk manifest by splitting pages at chapter boundaries.

    Respects max_pages_per_chunk as an upper limit. Prefers splitting
    at detected chapter boundaries when possible.
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
        next_is_break = (not is_last and sorted_pages[i + 1] in breaks)
        at_size_limit = pages_in_chunk >= max_pages_per_chunk

        if is_last or next_is_break or at_size_limit:
            title = _extract_title(pages, chunk_start, breaks)
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


def _extract_title(pages: dict[int, str], start_page: int, breaks: set[int]) -> str:
    """Try to extract a title from the first page of a chunk."""
    text = pages.get(start_page, "")
    if not text.strip():
        return f"Chunk starting at page {start_page}"
    first_line = text.strip().split("\n")[0].strip()
    if len(first_line) > 80:
        return first_line[:77] + "..."
    return first_line if first_line else f"Chunk starting at page {start_page}"
