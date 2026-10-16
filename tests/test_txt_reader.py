"""Tests for the plain-text book reader (Phase 1)."""

import pytest
from bookbridge.ingestion.txt_reader import decode_text, read_txt

from bookbridge.ingestion.models import IngestionError


class TestDecodeText:
    def test_decodes_utf8(self):
        assert decode_text("Café 咖啡".encode("utf-8")) == "Café 咖啡"

    def test_strips_utf8_bom(self):
        assert decode_text(b"\xef\xbb\xbfHello") == "Hello"

    def test_falls_back_to_gbk(self):
        assert decode_text("第一章 开始".encode("gbk")) == "第一章 开始"

    def test_decodes_utf16_with_bom(self):
        assert decode_text("Hello".encode("utf-16")) == "Hello"

    def test_normalises_line_endings(self):
        assert decode_text(b"a\r\nb\rc") == "a\nb\nc"

    def test_rejects_undecodable_bytes(self):
        with pytest.raises(IngestionError):
            decode_text(b"\xff\xfe\xfd\x80\x81" * 3 + b"\x00\xff")


class TestParagraphs:
    def test_blank_lines_separate_paragraphs_and_wrapped_lines_join(self):
        text = "Chapter 1\n\nIt was a dark\nand stormy night.\n\nThe end."
        book = read_txt(text.encode())
        assert book.chapters[0].paragraphs == [
            "Chapter 1",
            "It was a dark and stormy night.",
            "The end.",
        ]

    def test_cjk_wrapped_lines_join_without_space(self):
        text = "第一章\n\n他走进\n房间。\n\n她笑了。"
        book = read_txt(text.encode())
        assert book.chapters[0].paragraphs == ["第一章", "他走进房间。", "她笑了。"]

    def test_line_per_paragraph_when_no_blank_lines(self):
        lines = [f"　　第{i}句话。" for i in range(40)]
        text = "第一章 开端\n" + "\n".join(lines)
        book = read_txt(text.encode())
        assert book.chapters[0].paragraphs[0] == "第一章 开端"
        assert book.chapters[0].paragraphs[1] == "第0句话。"
        assert len(book.chapters[0].paragraphs) == 41

    def test_collapses_internal_whitespace(self):
        book = read_txt(b"Hello    \t world")
        assert book.chapters[0].paragraphs == ["Hello world"]


class TestChapterDetection:
    @pytest.mark.parametrize(
        "heading",
        [
            "Chapter 12",
            "CHAPTER XII",
            "CHAPTER I. Down the Rabbit-Hole",
            "Chapter One",
            "第十二章",
            "第12章 重逢",
            "第三回",
            "PROLOGUE",
            "Epilogue",
            "PART TWO",
        ],
    )
    def test_recognises_heading(self, heading):
        text = f"Intro.\n\n{heading}\n\nBody text."
        book = read_txt(text.encode())
        assert [c.title for c in book.chapters] == ["Front Matter", heading]

    def test_ordinary_sentence_is_not_a_heading(self):
        text = "Chapter one was long, she said.\n\nMore text."
        book = read_txt(text.encode())
        assert len(book.chapters) == 1

    def test_splits_chapters_and_numbers_them(self):
        text = "CHAPTER I\n\nAlpha.\n\nCHAPTER II\n\nBeta.\n\nGamma."
        book = read_txt(text.encode(), source_file="b.txt")
        assert book.source_file == "b.txt"
        assert [(c.number, c.title) for c in book.chapters] == [
            (1, "CHAPTER I"),
            (2, "CHAPTER II"),
        ]
        assert book.chapters[1].paragraphs == ["CHAPTER II", "Beta.", "Gamma."]

    def test_no_front_matter_chapter_when_book_starts_with_heading(self):
        book = read_txt(b"Chapter 1\n\nText.")
        assert book.chapters[0].title == "Chapter 1"

    def test_table_of_contents_does_not_create_empty_chapters(self):
        toc = "Contents\n\nCHAPTER I\n\nCHAPTER II\n\n"
        body = "CHAPTER I\n\nAlpha.\n\nCHAPTER II\n\nBeta."
        book = read_txt((toc + body).encode())
        assert [c.title for c in book.chapters] == ["Front Matter", "CHAPTER I", "CHAPTER II"]
        assert all(len(c.paragraphs) >= 2 for c in book.chapters[1:])
        assert book.chapters[0].paragraphs == ["Contents", "CHAPTER I", "CHAPTER II"]

    def test_falls_back_to_fixed_size_parts_without_headings(self):
        text = "\n\n".join(f"Paragraph {i}." for i in range(7))
        book = read_txt(text.encode(), paragraphs_per_part=3)
        assert [c.title for c in book.chapters] == ["Part 1", "Part 2", "Part 3"]
        assert [len(c.paragraphs) for c in book.chapters] == [3, 3, 1]


class TestGutenbergBoilerplate:
    def test_strips_gutenberg_header_and_footer(self):
        text = (
            "The Project Gutenberg eBook of Alice\n\nLicense blah.\n\n"
            "*** START OF THE PROJECT GUTENBERG EBOOK ALICE ***\n\n"
            "CHAPTER I\n\nAlice was beginning.\n\n"
            "*** END OF THE PROJECT GUTENBERG EBOOK ALICE ***\n\nMore license."
        )
        book = read_txt(text.encode())
        all_paragraphs = [p for c in book.chapters for p in c.paragraphs]
        assert all_paragraphs == ["CHAPTER I", "Alice was beginning."]


class TestEmptyInput:
    def test_rejects_empty_text(self):
        with pytest.raises(IngestionError):
            read_txt(b"   \n\n  ")
