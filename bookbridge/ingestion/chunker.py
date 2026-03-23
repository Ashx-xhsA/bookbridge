"""Smart document chunker with chapter boundary detection."""

from bookbridge.ingestion.models import ChunkInfo, ChunkManifest


def detect_chapter_breaks(pages: dict[int, str]) -> set[int]:
    """Find page numbers where new chapters or structural sections begin."""
    raise NotImplementedError("TDD: implement to pass tests")


def build_chunk_manifest(
    pages: dict[int, str],
    max_pages_per_chunk: int = 20,
    source_file: str = "",
) -> ChunkManifest:
    """Build a chunk manifest by splitting pages at chapter boundaries."""
    raise NotImplementedError("TDD: implement to pass tests")
