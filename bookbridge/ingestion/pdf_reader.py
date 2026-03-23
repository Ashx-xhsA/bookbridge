"""PDF text extraction and cleaning utilities."""

from pathlib import Path


def is_noise_line(line: str) -> bool:
    """Check if a line is OCR garbage."""
    raise NotImplementedError("TDD: implement to pass tests")


def is_running_header(line: str) -> bool:
    """Check if a line matches known running header patterns."""
    raise NotImplementedError("TDD: implement to pass tests")


def is_noise_page(text: str) -> bool:
    """Determine if a page is mostly OCR garbage."""
    raise NotImplementedError("TDD: implement to pass tests")


def clean_page_text(text: str) -> str:
    """Clean a single page of extracted text."""
    raise NotImplementedError("TDD: implement to pass tests")


def extract_pages(pdf_path: Path) -> dict[int, str]:
    """Extract and clean text from each page of a PDF."""
    raise NotImplementedError("TDD: implement to pass tests")
