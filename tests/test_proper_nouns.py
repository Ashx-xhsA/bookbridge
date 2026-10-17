"""Only proper nouns may enter the bible or the auto-extracted glossary."""

import pytest

from bookbridge.harness.proper_nouns import is_proper_noun


@pytest.mark.parametrize(
    "name",
    [
        "Gregor Samsa",
        "Grete",
        "St. Petersburg",
        "Mr. Samsa",
        "Herr Samsa",
        "Fraulein Frieda Brandenfeld",
        "Charlotte Street",
        "Russian Revolution",
        "Bank of England",
        "The Hague",
        "Ludwig van Beethoven",
        "O’Brien",
        "Gandalf the Grey",
        "221B Baker Street",
    ],
)
def test_accepts_proper_nouns(name: str) -> None:
    assert is_proper_noun(name)


@pytest.mark.parametrize(
    "name",
    [
        "firm",
        "office",
        "friend",
        "bank",
        "head clerk",
        "the sofa",
        "charwoman",
        "janitor’s wife",
        "the old wizard",
        "the sister",
        "Head clerk",  # a capitalised first word alone is not enough
        "Mother",  # kinship words and titles used as a form of address
        "Father",
        "The Sister",
        "Chief",
        "Mr.",
        "Sir",
        "Sunday",
        "",
        "   ",
    ],
)
def test_rejects_common_nouns_titles_and_blanks(name: str) -> None:
    assert not is_proper_noun(name)
