"""PDF text extraction and cleaning utilities."""

import re
from pathlib import Path

RUNNING_HEADER_PATTERNS = [
    re.compile(r"^\s*CHINA\s+MI[A-Z\^£$]*V[A-Z\^£$]*[LI][A-Z\^£$]*E?\s*$", re.IGNORECASE),
    re.compile(r"^\s*EMBA.{0,3}S?Y?\s*TOWN\s*$", re.IGNORECASE),
    re.compile(r"^\s*EMBA.{0,3}SYTOWN\s+\d+\s*$", re.IGNORECASE),
    re.compile(r"^\s*\d{1,3}\s+CHINA\s+MI", re.IGNORECASE),
]

NOISE_THRESHOLD = 0.6


def is_noise_line(line: str) -> bool:
    """Check if a line is OCR garbage."""
    stripped = line.strip()
    if not stripped:
        return False
    alpha_count = sum(1 for c in stripped if c.isalpha())
    if len(stripped) < 3:
        return True
    return alpha_count / len(stripped) < 0.3


def is_running_header(line: str) -> bool:
    """Check if a line matches known running header patterns."""
    return any(p.match(line) for p in RUNNING_HEADER_PATTERNS)


def is_noise_page(text: str) -> bool:
    """Determine if a page is mostly OCR garbage."""
    lines = [line for line in text.split("\n") if line.strip()]
    if not lines:
        return True
    noise_count = sum(1 for line in lines if is_noise_line(line))
    return noise_count / len(lines) > NOISE_THRESHOLD


def clean_page_text(text: str) -> str:
    """Clean a single page of extracted text."""
    lines = text.split("\n")
    cleaned = []
    for line in lines:
        if is_running_header(line):
            continue
        line = line.replace("\t", " ")
        line = re.sub(r"  +", " ", line)
        cleaned.append(line)
    return "\n".join(cleaned).strip()


def extract_pages(pdf_path: Path) -> dict[int, str]:
    """Extract and clean text from each page of a PDF."""
    import pdfplumber

    pages: dict[int, str] = {}
    with pdfplumber.open(pdf_path) as pdf:
        for i, page in enumerate(pdf.pages):
            page_num = i + 1
            raw = page.extract_text() or ""
            cleaned = clean_page_text(raw)
            if is_noise_page(cleaned):
                pages[page_num] = ""
            else:
                pages[page_num] = cleaned
    return pages
