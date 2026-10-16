"""Tests for the EPUB reader (Phase 1), including archive-safety defences."""

import io
import zipfile

import pytest
from bookbridge.ingestion.epub_reader import DRMProtectedError, EpubLimits, read_epub

from bookbridge.ingestion.models import IngestionError

CONTAINER = """<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>"""


def _xhtml(body: str, title: str = "t") -> str:
    return (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">'
        f"<head><title>{title}</title><style>p {{ color: red; }}</style></head>"
        f"<body>{body}</body></html>"
    )


def _opf(items: list[tuple[str, str, str, str]], spine: list[str], toc_id: str = "") -> str:
    manifest = "".join(
        f'<item id="{i}" href="{h}" media-type="{m}"' + (f' properties="{p}"' if p else "") + "/>"
        for i, h, m, p in items
    )
    toc_attr = f' toc="{toc_id}"' if toc_id else ""
    itemrefs = "".join(f'<itemref idref="{s}"/>' for s in spine)
    return (
        '<?xml version="1.0"?>'
        '<package xmlns="http://www.idpf.org/2007/opf" version="3.0">'
        "<metadata/>"
        f"<manifest>{manifest}</manifest><spine{toc_attr}>{itemrefs}</spine></package>"
    )


def _nav(entries: list[tuple[str, str]]) -> str:
    lis = "".join(f'<li><a href="{h}">{t}</a></li>' for t, h in entries)
    return _xhtml(f'<nav epub:type="toc"><ol>{lis}</ol></nav>')


def _build(files: dict[str, str | bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("mimetype", "application/epub+zip")
        zf.writestr("META-INF/container.xml", CONTAINER)
        for name, content in files.items():
            zf.writestr(name, content)
    return buf.getvalue()


XHTML = "application/xhtml+xml"


def _epub3(docs: dict[str, str], toc: list[tuple[str, str]]) -> bytes:
    items = [("nav", "nav.xhtml", XHTML, "nav")]
    items += [(f"d{i}", name, XHTML, "") for i, name in enumerate(docs)]
    spine = [f"d{i}" for i in range(len(docs))]
    files: dict[str, str | bytes] = {
        "OEBPS/content.opf": _opf(items, spine),
        "OEBPS/nav.xhtml": _nav(toc),
    }
    files.update({f"OEBPS/{name}": body for name, body in docs.items()})
    return _build(files)


class TestEpub3:
    def test_reads_chapters_in_spine_order_with_nav_titles(self):
        data = _epub3(
            {
                "c1.xhtml": _xhtml("<h1>One</h1><p>Alpha.</p><p>Beta.</p>"),
                "c2.xhtml": _xhtml("<h1>Two</h1><p>Gamma.</p>"),
            },
            [("Chapter One", "c1.xhtml"), ("Chapter Two", "c2.xhtml")],
        )
        book = read_epub(data, source_file="b.epub")
        assert book.source_file == "b.epub"
        assert [(c.number, c.title) for c in book.chapters] == [
            (1, "Chapter One"),
            (2, "Chapter Two"),
        ]
        assert book.chapters[0].paragraphs == ["One", "Alpha.", "Beta."]
        assert book.chapters[1].paragraphs == ["Two", "Gamma."]

    def test_splits_one_file_on_fragment_anchors(self):
        body = (
            '<h2 id="ch1">I</h2><p>First.</p>'
            '<div><h2 id="ch2">II</h2></div><p>Second.</p><p>More.</p>'
        )
        data = _epub3(
            {"all.xhtml": _xhtml(body)},
            [("Chapter I", "all.xhtml#ch1"), ("Chapter II", "all.xhtml#ch2")],
        )
        book = read_epub(data)
        assert [c.title for c in book.chapters] == ["Chapter I", "Chapter II"]
        assert book.chapters[0].paragraphs == ["I", "First."]
        assert book.chapters[1].paragraphs == ["II", "Second.", "More."]

    def test_content_before_first_toc_entry_becomes_front_matter(self):
        data = _epub3(
            {
                "title.xhtml": _xhtml("<p>A Novel</p>"),
                "c1.xhtml": _xhtml("<p>Alpha.</p>"),
            },
            [("Chapter 1", "c1.xhtml")],
        )
        book = read_epub(data)
        assert [c.title for c in book.chapters] == ["Front Matter", "Chapter 1"]

    def test_chapter_spans_untitled_spine_documents(self):
        data = _epub3(
            {
                "c1.xhtml": _xhtml("<p>Alpha.</p>"),
                "c1b.xhtml": _xhtml("<p>Alpha continued.</p>"),
                "c2.xhtml": _xhtml("<p>Beta.</p>"),
            },
            [("One", "c1.xhtml"), ("Two", "c2.xhtml")],
        )
        book = read_epub(data)
        assert book.chapters[0].paragraphs == ["Alpha.", "Alpha continued."]

    def test_extracts_block_text_and_ignores_script_style(self):
        body = (
            "<p>Hello <em>bold</em>\n   world&nbsp;&amp; you.</p>"
            "<script>var x = 1;</script>"
            "<blockquote><p>Quoted.</p></blockquote>"
            "<p>Line one<br/>Line two</p>"
            "<ul><li>Item</li></ul>"
            "<p>   </p>"
        )
        data = _epub3({"c.xhtml": _xhtml(body)}, [("C", "c.xhtml")])
        assert read_epub(data).chapters[0].paragraphs == [
            "Hello bold world & you.",
            "Quoted.",
            "Line one\nLine two",
            "Item",
        ]

    def test_skips_chapters_without_text(self):
        data = _epub3(
            {"c1.xhtml": _xhtml("<p>Alpha.</p>"), "img.xhtml": _xhtml("<img src='x.png'/>")},
            [("One", "c1.xhtml"), ("Plate", "img.xhtml")],
        )
        assert [c.title for c in read_epub(data).chapters] == ["One"]

    def test_falls_back_to_one_chapter_per_spine_doc_without_toc(self):
        items = [("a", "a.xhtml", XHTML, ""), ("b", "b.xhtml", XHTML, "")]
        data = _build(
            {
                "OEBPS/content.opf": _opf(items, ["a", "b"]),
                "OEBPS/a.xhtml": _xhtml("<h1>Opening</h1><p>x</p>"),
                "OEBPS/b.xhtml": _xhtml("<p>y</p>"),
            }
        )
        book = read_epub(data)
        assert [c.title for c in book.chapters] == ["Opening", "Section 2"]


class TestEpub2Ncx:
    def test_reads_ncx_toc(self):
        ncx = (
            '<?xml version="1.0"?>'
            '<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" '
            '"http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">'
            '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"><navMap>'
            '<navPoint id="n1"><navLabel><text>First</text></navLabel>'
            '<content src="text/c1.xhtml"/></navPoint>'
            '<navPoint id="n2"><navLabel><text>Second</text></navLabel>'
            '<content src="text/c2.xhtml"/></navPoint>'
            "</navMap></ncx>"
        )
        items = [
            ("ncx", "toc.ncx", "application/x-dtbncx+xml", ""),
            ("c1", "text/c1.xhtml", XHTML, ""),
            ("c2", "text/c2.xhtml", XHTML, ""),
        ]
        data = _build(
            {
                "OEBPS/content.opf": _opf(items, ["c1", "c2"], toc_id="ncx"),
                "OEBPS/toc.ncx": ncx,
                "OEBPS/text/c1.xhtml": _xhtml("<p>One.</p>"),
                "OEBPS/text/c2.xhtml": _xhtml("<p>Two.</p>"),
            }
        )
        book = read_epub(data)
        assert [c.title for c in book.chapters] == ["First", "Second"]


class TestSafety:
    def test_rejects_non_zip(self):
        with pytest.raises(IngestionError):
            read_epub(b"not a zip file")

    def test_rejects_missing_container(self):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("mimetype", "application/epub+zip")
        with pytest.raises(IngestionError):
            read_epub(buf.getvalue())

    def test_rejects_drm_encrypted_content(self):
        enc = (
            '<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" '
            'xmlns:enc="http://www.w3.org/2001/04/xmlenc#">'
            '<enc:EncryptedData><enc:EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes128-cbc"/>'
            '<enc:CipherData><enc:CipherReference URI="OEBPS/c.xhtml"/></enc:CipherData>'
            "</enc:EncryptedData></encryption>"
        )
        buf = io.BytesIO(_epub3({"c.xhtml": _xhtml("<p>x</p>")}, [("C", "c.xhtml")]))
        with zipfile.ZipFile(buf, "a") as zf:
            zf.writestr("META-INF/encryption.xml", enc)
        with pytest.raises(DRMProtectedError):
            read_epub(buf.getvalue())

    def test_allows_font_obfuscation_only(self):
        enc = (
            '<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" '
            'xmlns:enc="http://www.w3.org/2001/04/xmlenc#">'
            '<enc:EncryptedData><enc:EncryptionMethod Algorithm="http://www.idpf.org/2008/embedding"/>'
            '<enc:CipherData><enc:CipherReference URI="OEBPS/fonts/a.otf"/></enc:CipherData>'
            "</enc:EncryptedData></encryption>"
        )
        buf = io.BytesIO(_epub3({"c.xhtml": _xhtml("<p>x</p>")}, [("C", "c.xhtml")]))
        with zipfile.ZipFile(buf, "a") as zf:
            zf.writestr("META-INF/encryption.xml", enc)
        assert read_epub(buf.getvalue()).chapters[0].paragraphs == ["x"]

    def test_rejects_adobe_rights_file(self):
        buf = io.BytesIO(_epub3({"c.xhtml": _xhtml("<p>x</p>")}, [("C", "c.xhtml")]))
        with zipfile.ZipFile(buf, "a") as zf:
            zf.writestr("META-INF/rights.xml", "<rights/>")
        with pytest.raises(DRMProtectedError):
            read_epub(buf.getvalue())

    def test_rejects_too_many_files(self):
        data = _epub3({"c.xhtml": _xhtml("<p>x</p>")}, [("C", "c.xhtml")])
        with pytest.raises(IngestionError, match="too many"):
            read_epub(data, limits=EpubLimits(max_files=3))

    def test_rejects_oversized_entry(self):
        big = _xhtml("<p>" + "a" * 5000 + "</p>")
        data = _epub3({"c.xhtml": big}, [("C", "c.xhtml")])
        with pytest.raises(IngestionError, match="too large"):
            read_epub(data, limits=EpubLimits(max_entry_bytes=1000))

    def test_rejects_oversized_total(self):
        docs = {f"c{i}.xhtml": _xhtml("<p>" + "a" * 800 + "</p>") for i in range(5)}
        data = _epub3(docs, [("C", "c0.xhtml")])
        with pytest.raises(IngestionError, match="too large"):
            read_epub(data, limits=EpubLimits(max_total_bytes=3000))

    def test_rejects_path_traversal_in_manifest(self):
        items = [("a", "../../etc/passwd", XHTML, "")]
        data = _build({"OEBPS/content.opf": _opf(items, ["a"])})
        with pytest.raises(IngestionError, match="path"):
            read_epub(data)

    def test_rejects_xml_entity_expansion(self):
        bomb = (
            '<?xml version="1.0"?><!DOCTYPE p [<!ENTITY a "aaaaaaaaaa">'
            '<!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">]>'
            '<package xmlns="http://www.idpf.org/2007/opf"><metadata>&b;</metadata>'
            "<manifest/><spine/></package>"
        )
        data = _build({"OEBPS/content.opf": bomb})
        with pytest.raises(IngestionError):
            read_epub(data)

    def test_rejects_book_with_no_text(self):
        data = _epub3({"c.xhtml": _xhtml("<img src='x.png'/>")}, [("C", "c.xhtml")])
        with pytest.raises(IngestionError):
            read_epub(data)
