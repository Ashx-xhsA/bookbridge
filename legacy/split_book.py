#!/usr/bin/env python3
"""
Splits Embassytown_english.pdf into 25 clean text chunks for translation.
Each chunk stays under ~20 content pages so it fits in one Cursor conversation.

Usage:
    python split_book.py
"""

import os
import re
import pdfplumber

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PDF_PATH = os.path.join(SCRIPT_DIR, "..", "Embassytown_english.pdf")
CHUNKS_DIR = os.path.join(SCRIPT_DIR, "chunks")

CHUNKS = [
    (1,  "chunk_01_front_matter",      1,  22,  "Front Matter (cover, copyright, dedication, acknowledgments, epigraph)"),
    (2,  "chunk_02_proem_01_02",       23, 42,  "PROEM: sections 0.1 and 0.2"),
    (3,  "chunk_03_proem_03",          43, 55,  "PROEM: section 0.3"),
    (4,  "chunk_04_part1_a",           56, 73,  "PART ONE: Latterday 1, Formerly 1"),
    (5,  "chunk_05_part1_b",           74, 90,  "PART ONE: Latterday 2, Formerly 2 (first half)"),
    (6,  "chunk_06_part1_c",           91, 105, "PART ONE: Formerly 2 (second half), Latterday 3"),
    (7,  "chunk_07_part2_a",           106, 120, "PART TWO - Festivals: Latterday 4, Formerly 3"),
    (8,  "chunk_08_part2_b",           121, 135, "PART TWO - Festivals: Latterday 5, Formerly 4"),
    (9,  "chunk_09_part2_c",           136, 148, "PART TWO - Festivals: Latterday 6, Formerly 5"),
    (10, "chunk_10_part2_d",           149, 153, "PART TWO - Festivals: Latterday 7, Formerly 6, Latterday 8"),
    (11, "chunk_11_part3_a",           154, 167, "PART THREE - Like As Not: Formerly 7, Formerly 8"),
    (12, "chunk_12_part3_b",           168, 177, "PART THREE - Like As Not: Formerly 9, Formerly 10"),
    (13, "chunk_13_part4_a",           178, 196, "PART FOUR: sections 9, 10"),
    (14, "chunk_14_part4_b",           197, 211, "PART FOUR: sections 11, 12"),
    (15, "chunk_15_part4_c",           212, 216, "PART FOUR: section 13"),
    (16, "chunk_16_part5_a",           217, 230, "PART FIVE: section 14"),
    (17, "chunk_17_part5_b",           231, 239, "PART FIVE: sections 15, 16"),
    (18, "chunk_18_part6_a",           240, 252, "PART SIX - New Kings: section 17"),
    (19, "chunk_19_part6_b",           253, 263, "PART SIX - New Kings: section 18"),
    (20, "chunk_20_part7_a",           264, 282, "PART SEVEN - The Languageless: sections 19, 20"),
    (21, "chunk_21_part7_b",           283, 293, "PART SEVEN - The Languageless: sections 21, 22"),
    (22, "chunk_22_part7_c",           294, 311, "PART SEVEN - The Languageless: sections 23, 24"),
    (23, "chunk_23_part8_a",           312, 325, "PART EIGHT - The Parley: sections 25, 26"),
    (24, "chunk_24_part8_b",           326, 347, "PART EIGHT - The Parley: sections 27, 28, 29"),
    (25, "chunk_25_part9",             348, 367, "PART NINE - The Relief: sections 30, 31"),
]

RUNNING_HEADER_PATTERNS = [
    re.compile(r"^\s*CHINA\s+MI[A-Z\^£$]*V[A-Z\^£$]*[LI][A-Z\^£$]*E?\s*$", re.IGNORECASE),
    re.compile(r"^\s*EMBA?S?S?Y\s*TOWN\s*$", re.IGNORECASE),
    re.compile(r"^\s*EMBA.{0,3}SYTOWN\s+\d+\s*$", re.IGNORECASE),
    re.compile(r"^\s*\d{1,3}\s+CHINA\s+MI", re.IGNORECASE),
]

NOISE_THRESHOLD = 0.6


def is_noise_line(line: str) -> bool:
    """Check if a line is OCR garbage (high ratio of non-alphanumeric chars)."""
    stripped = line.strip()
    if not stripped:
        return False
    alpha_count = sum(1 for c in stripped if c.isalpha())
    if len(stripped) < 3:
        return True
    return alpha_count / len(stripped) < 0.3


def is_running_header(line: str) -> bool:
    return any(p.match(line) for p in RUNNING_HEADER_PATTERNS)


def is_noise_page(text: str) -> bool:
    """A page is noise if most of its lines are garbage (illustration/scan artifact)."""
    lines = [l for l in text.split("\n") if l.strip()]
    if not lines:
        return True
    noise_count = sum(1 for l in lines if is_noise_line(l))
    return noise_count / len(lines) > NOISE_THRESHOLD


def clean_page_text(text: str) -> str:
    """Clean a single page's extracted text."""
    lines = text.split("\n")
    cleaned = []
    for line in lines:
        if is_running_header(line):
            continue
        line = line.replace("\t", " ")
        line = re.sub(r"  +", " ", line)
        cleaned.append(line)

    result = "\n".join(cleaned).strip()
    return result


def extract_pages(pdf_path: str) -> dict[int, str]:
    """Extract text from each page of the PDF. Returns {page_num: text}."""
    pages = {}
    print(f"Opening PDF: {pdf_path}")
    with pdfplumber.open(pdf_path) as pdf:
        total = len(pdf.pages)
        print(f"Total PDF pages: {total}")
        for i, page in enumerate(pdf.pages):
            page_num = i + 1
            raw = page.extract_text() or ""
            cleaned = clean_page_text(raw)

            if is_noise_page(cleaned):
                pages[page_num] = ""
            else:
                pages[page_num] = cleaned

            if page_num % 50 == 0:
                print(f"  Processed {page_num}/{total} pages...")

    print(f"  Processed {total}/{total} pages.")
    return pages


def write_chunk(chunk_info: tuple, pages: dict[int, str]):
    """Write a single chunk file."""
    chunk_num, filename, start_page, end_page, description = chunk_info
    os.makedirs(CHUNKS_DIR, exist_ok=True)

    out_path = os.path.join(CHUNKS_DIR, f"{filename}.txt")

    content_pages = 0
    body_parts = []
    for pg in range(start_page, end_page + 1):
        text = pages.get(pg, "")
        if not text.strip():
            continue
        content_pages += 1
        body_parts.append(f"--- Page {pg} of 376 ---\n\n{text}")

    header = (
        f"{'=' * 60}\n"
        f"CHUNK {chunk_num:02d} — {description}\n"
        f"Pages {start_page}-{end_page} ({content_pages} content pages)\n"
        f"{'=' * 60}\n"
    )

    with open(out_path, "w", encoding="utf-8") as f:
        f.write(header + "\n")
        f.write("\n\n".join(body_parts))
        f.write("\n")

    return out_path, content_pages


def main():
    if not os.path.exists(PDF_PATH):
        print(f"ERROR: PDF not found at {PDF_PATH}")
        print(f"Expected: Embassytown_english.pdf in the parent directory of this script.")
        return

    pages = extract_pages(PDF_PATH)

    print(f"\nWriting {len(CHUNKS)} chunks to {CHUNKS_DIR}/\n")
    total_content = 0
    for chunk_info in CHUNKS:
        path, count = write_chunk(chunk_info, pages)
        total_content += count
        print(f"  {os.path.basename(path):40s}  ({count} content pages)")

    print(f"\nDone! {len(CHUNKS)} chunks written, {total_content} total content pages.")
    print(f"Chunks saved in: {CHUNKS_DIR}/")


if __name__ == "__main__":
    main()
