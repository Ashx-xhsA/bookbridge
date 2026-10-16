"""EPUB book reader.

Reads XHTML documents in spine order, splits them into chapters using the
EPUB 3 nav document (or the EPUB 2 NCX), and extracts block-level paragraphs.

Untrusted-archive defences:
- zip-bomb: caps on file count, per-entry size and total uncompressed size,
  checked against the central directory and enforced again on every read;
- XXE / entity expansion: XML metadata is parsed with ``defusedxml``; content
  documents go through ``html.parser``, which never resolves external entities;
- path traversal: every manifest/TOC href must resolve inside the archive;
- DRM: books with encrypted content (other than font obfuscation) are rejected.
"""

import io
import posixpath
import re
import zipfile
from dataclasses import dataclass, field
from html.parser import HTMLParser
from urllib.parse import unquote
from xml.etree.ElementTree import Element, ParseError

from defusedxml import DefusedXmlException
from defusedxml.ElementTree import fromstring as parse_xml

from bookbridge.ingestion.models import Book, Chapter, IngestionError
from bookbridge.ingestion.txt_reader import group_by_headings

MB = 1024 * 1024
FONT_OBFUSCATION_ALGORITHMS = {
    "http://www.idpf.org/2008/embedding",
    "http://ns.adobe.com/pdf/enc#RC",
}
BLOCK_TAGS = {
    "p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "ul", "ol", "dl", "dd", "dt",
    "blockquote", "pre", "table", "tr", "td", "th", "caption", "figcaption", "section",
    "article", "aside", "header", "footer", "nav", "body", "hr",
}  # fmt: skip
HEADING_TAGS = {"h1", "h2", "h3"}
SKIP_TAGS = {"head", "script", "style", "svg"}
_XML_ENCODING = re.compile(rb"""^<\?xml[^>]*encoding=["']([A-Za-z0-9._-]+)["']""")
_SPACE = re.compile(r"\s+")
# A linked superscript this short is a note marker ("d", "12", "[3]", "*").
MAX_NOTE_MARKER_CHARS = 4


class DRMProtectedError(IngestionError):
    """The EPUB is DRM-protected and cannot be read."""


@dataclass(frozen=True)
class EpubLimits:
    max_files: int = 5000
    max_entry_bytes: int = 50 * MB
    max_total_bytes: int = 200 * MB


@dataclass
class _Package:
    spine: list[str] = field(default_factory=list)
    nav_path: str | None = None
    ncx_path: str | None = None


@dataclass
class _TocEntry:
    title: str
    path: str
    fragment: str | None


def read_epub(data: bytes, source_file: str = "", limits: EpubLimits | None = None) -> Book:
    """Parse an EPUB into chapters of paragraphs."""
    limits = limits or EpubLimits()
    try:
        zf = zipfile.ZipFile(io.BytesIO(data))
    except (zipfile.BadZipFile, OSError) as exc:
        raise IngestionError("The file is not a valid EPUB (zip) archive.") from exc
    with zf:
        reader = _Archive(zf, limits)
        reader.check_limits()
        reader.reject_drm()
        package = reader.read_package(reader.rootfile_path())
        toc = reader.read_toc(package)
        chapters = _build_chapters(reader, package.spine, toc)
    if len(chapters) == 1:
        # TXT-converted EPUBs often have a one-entry TOC over the whole text;
        # fall back to the same heading rules the TXT reader uses.
        chapters = group_by_headings(chapters[0].paragraphs) or chapters
    if not chapters:
        raise IngestionError("No readable text was found in the EPUB.")
    return Book(source_file=source_file, chapters=chapters)


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _children(el: Element, name: str) -> list[Element]:
    return [c for c in el if _local(c.tag) == name]


def _resolve(base_dir: str, href: str) -> tuple[str, str | None]:
    """Resolve an href relative to base_dir; reject anything escaping the archive."""
    path, _, fragment = unquote(href).partition("#")
    resolved = posixpath.normpath(posixpath.join(base_dir, path)) if path else ""
    if resolved.startswith(("/", "../")) or resolved == "..":
        raise IngestionError("The EPUB contains an invalid file path.")
    return resolved, fragment or None


class _Archive:
    def __init__(self, zf: zipfile.ZipFile, limits: EpubLimits) -> None:
        self.zf = zf
        self.limits = limits
        self.names = set(zf.namelist())

    def check_limits(self) -> None:
        infos = self.zf.infolist()
        if len(infos) > self.limits.max_files:
            raise IngestionError("The EPUB contains too many files.")
        if any(i.file_size > self.limits.max_entry_bytes for i in infos):
            raise IngestionError("A file inside the EPUB is too large.")
        if sum(i.file_size for i in infos) > self.limits.max_total_bytes:
            raise IngestionError("The EPUB is too large when uncompressed.")

    def read(self, name: str) -> bytes:
        if name not in self.names:
            raise IngestionError("The EPUB is missing a referenced file.")
        with self.zf.open(name) as fh:
            data = fh.read(self.limits.max_entry_bytes + 1)
        if len(data) > self.limits.max_entry_bytes:
            raise IngestionError("A file inside the EPUB is too large.")
        return data

    def xml(self, name: str) -> Element:
        try:
            return parse_xml(self.read(name))
        except (ParseError, DefusedXmlException) as exc:
            raise IngestionError("The EPUB contains malformed XML metadata.") from exc

    def text(self, name: str) -> str:
        data = self.read(name)
        match = _XML_ENCODING.match(data)
        encoding = match.group(1).decode() if match else "utf-8"
        try:
            return data.decode(encoding, errors="replace")
        except LookupError:
            return data.decode("utf-8", errors="replace")

    def reject_drm(self) -> None:
        if "META-INF/rights.xml" in self.names:
            raise DRMProtectedError("This EPUB is DRM-protected and cannot be translated.")
        if "META-INF/encryption.xml" not in self.names:
            return
        for enc in self.xml("META-INF/encryption.xml").iter():
            if _local(enc.tag) != "EncryptedData":
                continue
            methods = [m for m in enc.iter() if _local(m.tag) == "EncryptionMethod"]
            algorithm = methods[0].get("Algorithm", "") if methods else ""
            if algorithm not in FONT_OBFUSCATION_ALGORITHMS:
                raise DRMProtectedError("This EPUB is DRM-protected and cannot be translated.")

    def rootfile_path(self) -> str:
        if "META-INF/container.xml" not in self.names:
            raise IngestionError("The file is not a valid EPUB (missing container.xml).")
        for el in self.xml("META-INF/container.xml").iter():
            if _local(el.tag) == "rootfile" and el.get("full-path"):
                return _resolve("", el.get("full-path", ""))[0]
        raise IngestionError("The EPUB does not declare a package document.")

    def read_package(self, opf_path: str) -> _Package:
        root = self.xml(opf_path)
        base = posixpath.dirname(opf_path)
        items: dict[str, tuple[str, str, str]] = {}
        for el in root.iter():
            if _local(el.tag) == "item" and el.get("id") and el.get("href"):
                path = _resolve(base, el.get("href", ""))[0]
                items[el.get("id", "")] = (path, el.get("media-type", ""), el.get("properties", ""))
        package = _Package()
        for el in root.iter():
            if _local(el.tag) == "spine" and el.get("toc") in items:
                package.ncx_path = items[el.get("toc", "")][0]
            if (
                _local(el.tag) == "itemref"
                and el.get("idref") in items
                and el.get("linear") != "no"
            ):
                package.spine.append(items[el.get("idref", "")][0])
        for path, media_type, properties in items.values():
            if "nav" in properties.split():
                package.nav_path = path
            if media_type == "application/x-dtbncx+xml" and package.ncx_path is None:
                package.ncx_path = path
        return package

    def read_toc(self, package: _Package) -> list[_TocEntry]:
        entries: list[_TocEntry] = []
        if package.nav_path:
            entries = self._nav_toc(package.nav_path)
        if not entries and package.ncx_path:
            entries = self._ncx_toc(package.ncx_path)
        spine = set(package.spine)
        seen: set[tuple[str, str | None]] = set()
        result = []
        for e in entries:
            key = (e.path, e.fragment)
            if e.path in spine and e.title and key not in seen:
                seen.add(key)
                result.append(e)
        return result

    def _nav_toc(self, nav_path: str) -> list[_TocEntry]:
        parser = _NavParser()
        parser.feed(self.text(nav_path))
        base = posixpath.dirname(nav_path)
        return [_TocEntry(t, *_resolve(base, h)) for t, h in parser.links()]

    def _ncx_toc(self, ncx_path: str) -> list[_TocEntry]:
        base = posixpath.dirname(ncx_path)
        entries = []
        for point in self.xml(ncx_path).iter():
            if _local(point.tag) != "navPoint":
                continue
            labels = [t for lab in _children(point, "navLabel") for t in _children(lab, "text")]
            contents = _children(point, "content")
            if labels and contents and contents[0].get("src"):
                title = _SPACE.sub(" ", labels[0].text or "").strip()
                entries.append(_TocEntry(title, *_resolve(base, contents[0].get("src", ""))))
        return entries


class _NavParser(HTMLParser):
    """Collects (title, href) links from the toc <nav> of an EPUB 3 nav document."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.navs: list[tuple[bool, list[tuple[str, str]]]] = []
        self._depth = 0
        self._href: str | None = None
        self._text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        a = dict(attrs)
        if tag == "nav":
            if self._depth == 0:
                self.navs.append(("toc" in (a.get("epub:type") or "").split(), []))
            self._depth += 1
        elif tag == "a" and self._depth and a.get("href"):
            self._href, self._text = a.get("href"), []

    def handle_endtag(self, tag: str) -> None:
        if tag == "nav" and self._depth:
            self._depth -= 1
        elif tag == "a" and self._href is not None:
            title = _SPACE.sub(" ", "".join(self._text)).strip()
            self.navs[-1][1].append((title, self._href))
            self._href = None

    def handle_data(self, data: str) -> None:
        if self._href is not None:
            self._text.append(data)

    def links(self) -> list[tuple[str, str]]:
        tocs = [links for is_toc, links in self.navs if is_toc]
        if tocs:
            return tocs[0]
        return self.navs[0][1] if self.navs else []


@dataclass
class _OpenLink:
    start: int  # index into the text buffer where the link's text begins
    internal: bool  # href points at a fragment (#id), as note links do
    noteref: bool  # marked epub:type="noteref" / role="doc-noteref"
    has_sup: bool  # inside or wrapping a <sup>


class _ContentParser(HTMLParser):
    """Turns an XHTML document into a stream of paragraphs and anchor hits.

    ``events`` holds ("para", text) and ("anchor", id) tuples in document order.
    """

    def __init__(self, anchors: set[str]) -> None:
        super().__init__(convert_charrefs=True)
        self.anchors = anchors
        self.events: list[tuple[str, str]] = []
        self.first_heading: str | None = None
        self._buf: list[str] = []
        self._skip = 0
        self._in_heading = False
        self._sup_depth = 0
        self._links: list[_OpenLink] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in SKIP_TAGS:
            self._skip += 1
        elif tag == "br":
            self._buf.append("\n")
        elif tag == "sup":
            self._sup_depth += 1
            if self._links:
                self._links[-1].has_sup = True
        elif tag == "a":
            self._open_link(dict(attrs))
        if tag in BLOCK_TAGS:
            self._flush()
            self._in_heading = tag in HEADING_TAGS
        anchor = dict(attrs).get("id")
        if anchor and anchor in self.anchors:
            self._flush()
            self.events.append(("anchor", anchor))

    def handle_endtag(self, tag: str) -> None:
        if tag in SKIP_TAGS and self._skip:
            self._skip -= 1
        elif tag == "sup" and self._sup_depth:
            self._sup_depth -= 1
        elif tag == "a" and self._links:
            self._close_link(self._links.pop())
        if tag in BLOCK_TAGS:
            self._flush()
            self._in_heading = False

    def handle_data(self, data: str) -> None:
        if not self._skip:
            # Source newlines are layout only; <br> is the one explicit line break.
            self._buf.append(data.replace("\n", " "))

    def close(self) -> None:
        super().close()
        self._flush()

    def _open_link(self, attrs: dict[str, str | None]) -> None:
        kinds = f"{attrs.get('epub:type') or ''} {attrs.get('role') or ''}"
        self._links.append(
            _OpenLink(
                start=len(self._buf),
                internal="#" in (attrs.get("href") or ""),
                noteref="noteref" in kinds,
                has_sup=self._sup_depth > 0,
            )
        )

    def _close_link(self, link: _OpenLink) -> None:
        """Drop a note marker's text: an explicit noteref, or a short linked superscript."""
        text = "".join(self._buf[link.start :]).strip()
        short_sup = link.internal and link.has_sup and len(text) <= MAX_NOTE_MARKER_CHARS
        if link.noteref or short_sup:
            del self._buf[link.start :]

    def _flush(self) -> None:
        lines = (_SPACE.sub(" ", line).strip() for line in "".join(self._buf).split("\n"))
        text = "\n".join(line for line in lines if line)
        self._buf = []
        for link in self._links:  # a link spanning a block boundary restarts here
            link.start = 0
        if not text:
            return
        if self._in_heading and self.first_heading is None:
            self.first_heading = text
        self.events.append(("para", text))


def _build_chapters(archive: _Archive, spine: list[str], toc: list[_TocEntry]) -> list[Chapter]:
    by_path: dict[str, list[_TocEntry]] = {}
    for entry in toc:
        by_path.setdefault(entry.path, []).append(entry)
    chapters: list[Chapter] = []
    front = Chapter(number=0, title="Front Matter")
    for position, path in enumerate(spine, start=1):
        entries = by_path.get(path, [])
        anchors = {e.fragment: e.title for e in entries if e.fragment}
        parser = _ContentParser(set(anchors))
        parser.feed(archive.text(path))
        parser.close()
        file_titles = [e.title for e in entries if not e.fragment]
        if file_titles:
            chapters.append(Chapter(number=0, title=file_titles[0]))
        elif not toc:
            title = parser.first_heading or f"Section {position}"
            chapters.append(Chapter(number=0, title=title[:200]))
        for kind, value in parser.events:
            if kind == "anchor":
                chapters.append(Chapter(number=0, title=anchors[value]))
            else:
                (chapters[-1] if chapters else front).paragraphs.append(value)
    result = ([front] if front.paragraphs else []) + [c for c in chapters if c.paragraphs]
    for number, chapter in enumerate(result, start=1):
        chapter.number = number
    return result
