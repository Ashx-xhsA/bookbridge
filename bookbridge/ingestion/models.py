"""Data models for the ingestion pipeline."""

from dataclasses import dataclass, field


@dataclass
class ChunkInfo:
    """Metadata for a single document chunk."""

    chunk_id: int
    title: str
    start_page: int
    end_page: int
    page_count: int

    def to_dict(self) -> dict:
        return {
            "chunk_id": self.chunk_id,
            "title": self.title,
            "start_page": self.start_page,
            "end_page": self.end_page,
            "page_count": self.page_count,
        }


@dataclass
class ChunkManifest:
    """Complete manifest describing how a document was split into chunks."""

    source_file: str
    total_pages: int
    chunks: list[ChunkInfo] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "source_file": self.source_file,
            "total_pages": self.total_pages,
            "chunks": [c.to_dict() for c in self.chunks],
        }
