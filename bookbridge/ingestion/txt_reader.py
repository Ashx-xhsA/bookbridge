"""Plain-text book reader.

Decodes UTF-8 / UTF-16 / GBK text, strips Project Gutenberg boilerplate,
splits paragraphs on blank lines (or one paragraph per line for CJK-style
files with no blank lines), and groups paragraphs into chapters by heading
patterns. Books with no recognisable headings are split into fixed-size parts.
"""

import re

from bookbridge.ingestion.models import Book, Chapter, IngestionError

DEFAULT_PARAGRAPHS_PER_PART = 50
MAX_HEADING_LENGTH = 80
# Below this ratio of blank-line blocks to non-empty lines, the file is treated
# as "one paragraph per line" (common in Chinese web-novel TXT files).
LINE_MODE_BLOCK_RATIO = 0.05
LINE_MODE_MIN_LINES = 20
MAX_CONTROL_CHAR_RATIO = 0.01

_EN_NUMBER = (
    r"(?:\d{1,4}|[IVXLCDM]{1,8}|the\s+\w+|one|two|three|four|five|six|seven|eight|nine|ten"
    r"|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)"
)
_TITLE_TAIL = r"(?:\s*[.:\-–—]\s*\S.*)?\.?"
HEADING_PATTERNS: list[re.Pattern[str]] = [
    re.compile(rf"^(?:chapter|part|book)\s+{_EN_NUMBER}{_TITLE_TAIL}$", re.IGNORECASE),
    re.compile(
        rf"^(?:prologue|epilogue|preface|foreword|introduction|afterword|interlude){_TITLE_TAIL}$",
        re.IGNORECASE,
    ),
    re.compile(r"^[IVXLC]{1,7}\.?$"),
    re.compile(r"^第[0-9０-９零〇一二三四五六七八九十百千两]+[章回节卷部篇](?:\s+\S.*)?$"),
    re.compile(r"^(?:序章|序言|楔子|尾声|后记)$"),
]

_GUTENBERG_START = re.compile(
    r"^\*{3}\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK.*$", re.IGNORECASE | re.MULTILINE
)
_GUTENBERG_END = re.compile(
    r"^\*{3}\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK.*$", re.IGNORECASE | re.MULTILINE
)
_CJK = re.compile(r"[⺀-鿿豈-﫿＀-￯]")
_INLINE_SPACE = re.compile(r"\s+")


def decode_text(data: bytes) -> str:
    """Decode book bytes, trying UTF-8 then GBK (via its superset GB18030)."""
    if data.startswith((b"\xff\xfe", b"\xfe\xff")):
        candidates = ["utf-16"]
    else:
        candidates = ["utf-8-sig", "gb18030"]
    for encoding in candidates:
        try:
            text = data.decode(encoding)
        except UnicodeDecodeError:
            continue
        text = text.replace("\r\n", "\n").replace("\r", "\n")
        if _looks_binary(text):
            raise IngestionError("The file does not look like a text document.")
        return text
    raise IngestionError("Could not detect the text encoding (expected UTF-8 or GBK).")


def _looks_binary(text: str) -> bool:
    if not text:
        return False
    controls = sum(1 for c in text if ord(c) < 32 and c not in "\n\t\f")
    return controls / len(text) > MAX_CONTROL_CHAR_RATIO


def read_txt(
    data: bytes,
    source_file: str = "",
    paragraphs_per_part: int = DEFAULT_PARAGRAPHS_PER_PART,
) -> Book:
    """Parse a plain-text book into chapters of paragraphs."""
    text = _strip_gutenberg(decode_text(data))
    paragraphs = split_paragraphs(text)
    if not paragraphs:
        raise IngestionError("The text file is empty.")
    chapters = group_by_headings(paragraphs) or _split_fixed(paragraphs, paragraphs_per_part)
    return Book(source_file=source_file, chapters=chapters)


def _strip_gutenberg(text: str) -> str:
    start = _GUTENBERG_START.search(text)
    if start:
        text = text[start.end() :]
    end = _GUTENBERG_END.search(text)
    if end:
        text = text[: end.start()]
    return text


def split_paragraphs(text: str) -> list[str]:
    """Split text into paragraphs, joining hard-wrapped lines."""
    lines = [line for line in text.split("\n") if line.strip()]
    blocks = [b for b in re.split(r"\n\s*\n", text) if b.strip()]
    line_mode = (
        len(lines) >= LINE_MODE_MIN_LINES and len(blocks) / len(lines) < LINE_MODE_BLOCK_RATIO
    )
    if line_mode:
        return [_INLINE_SPACE.sub(" ", line.strip()) for line in lines]
    return [_join_wrapped(block.split("\n")) for block in blocks]


def _join_wrapped(lines: list[str]) -> str:
    joined = ""
    for raw in lines:
        line = _INLINE_SPACE.sub(" ", raw.strip())
        if not line:
            continue
        if joined and not (_CJK.match(joined[-1]) and _CJK.match(line[0])):
            joined += " "
        joined += line
    return joined


def is_heading(paragraph: str) -> bool:
    if len(paragraph) > MAX_HEADING_LENGTH or "\n" in paragraph:
        return False
    return any(p.match(paragraph) for p in HEADING_PATTERNS)


def group_by_headings(paragraphs: list[str]) -> list[Chapter]:
    """Group paragraphs under headings. Returns [] when no heading starts a chapter.

    A heading immediately followed by another heading (e.g. a table of contents
    entry) does not open a chapter; it stays in the surrounding text.
    """
    front: list[str] = []
    chapters: list[Chapter] = []
    for i, para in enumerate(paragraphs):
        followed_by_body = i + 1 < len(paragraphs) and not is_heading(paragraphs[i + 1])
        if is_heading(para) and followed_by_body:
            chapters.append(Chapter(number=0, title=para, paragraphs=[para]))
        elif chapters:
            chapters[-1].paragraphs.append(para)
        else:
            front.append(para)
    if not chapters:
        return []
    if front:
        chapters.insert(0, Chapter(number=0, title="Front Matter", paragraphs=front))
    for number, chapter in enumerate(chapters, start=1):
        chapter.number = number
    return chapters


def _split_fixed(paragraphs: list[str], size: int) -> list[Chapter]:
    size = max(1, size)
    return [
        Chapter(number=n, title=f"Part {n}", paragraphs=paragraphs[start : start + size])
        for n, start in enumerate(range(0, len(paragraphs), size), start=1)
    ]
