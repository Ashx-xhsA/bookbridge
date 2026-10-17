"""Is this name a proper noun? Gate for everything auto-added to the bible/glossary.

Only proper nouns (people, places, organisations, named things) get a fixed
translation; common nouns like "firm", "office" or "head clerk" must stay free
to be translated by context, or the term check reports false errors.

A name passes when, after an optional leading article:
- every word starts with a capital letter (or a digit, as in "221B"), except
  connecting words such as "of", "von", "the" inside a name;
- at least one capitalised word is not a title, kinship word or weekday —
  "Mr. Samsa" passes, "Mother", "Chief" or "Mr." alone do not.
Callers also check that the name occurs in the book as written (see
`matching.occurs`), so a model that capitalises "Head Clerk" gains nothing.
"""

from __future__ import annotations

import re

_ARTICLES = frozenset({"the", "a", "an"})
_CONNECTORS = frozenset(
    {"of", "the", "and", "&", "de", "du", "des", "la", "le", "les", "von", "van", "der",
     "den", "di", "da", "del", "della", "al", "el", "bin", "ibn", "on", "upon", "in", "y"}
)  # fmt: skip
_GENERIC = frozenset(
    {
        # titles and forms of address
        "mr", "mrs", "ms", "miss", "mister", "sir", "madam", "madame", "lady", "lord",
        "herr", "frau", "fraulein", "fräulein", "monsieur", "mademoiselle", "signor",
        "señor", "doctor", "dr", "professor", "prof", "captain", "chief", "boss", "master",
        "mistress", "king", "queen", "prince", "princess", "emperor", "empress", "duke",
        "duchess", "count", "countess", "baron", "baroness", "general", "colonel",
        "major", "sergeant", "lieutenant", "officer", "judge", "head", "clerk",
        # kinship
        "father", "mother", "sister", "brother", "son", "daughter", "uncle", "aunt",
        "grandfather", "grandmother", "grandma", "grandpa", "mom", "mum", "dad", "papa",
        "mama", "ma", "pa", "wife", "husband", "cousin", "nephew", "niece",
        # weekdays
        "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
    }
)  # fmt: skip
# Geological periods and epochs. "Jurassic Europe" or "Late Cretaceous
# Laramidia" describes a place at a time, not a name (the place alone is the
# term), and a bare period has a standard translation. Costs the rare real
# name that starts with one ("Jurassic Coast").
_PERIOD_PREFIX = frozenset({"early", "middle", "late", "upper", "lower"})
_PERIODS = frozenset(
    {
        "hadean", "archean", "proterozoic", "ediacaran", "cambrian", "ordovician",
        "silurian", "devonian", "carboniferous", "mississippian", "pennsylvanian",
        "permian", "triassic", "jurassic", "cretaceous", "paleogene", "palaeogene",
        "neogene", "quaternary", "paleocene", "palaeocene", "eocene", "oligocene",
        "miocene", "pliocene", "pleistocene", "holocene", "paleozoic", "palaeozoic",
        "mesozoic", "cenozoic", "precambrian",
    }
)  # fmt: skip
# "d’Artagnan", "l'Orient": a short lowercase particle glued to a capitalised name.
_PARTICLE = re.compile(r"^[a-z]{1,2}['’][A-Z]")


def _capitalised(word: str) -> bool:
    return word[0].isupper() or word[0].isdigit() or bool(_PARTICLE.match(word))


def _core(word: str) -> str:
    """Lowercase word without trailing punctuation or possessive ('Samsa’s' → 'samsa')."""
    return re.sub(r"(['’]s)?[.,]*$", "", word).lower()


# Only names of people and places go into the bible and the extracted
# glossary: they are what a translator renders inconsistently. Organizations,
# objects and other named things are left to the translator.
GLOSSARY_CATEGORIES = frozenset({"person", "place"})


def _starts_with_period(words: list[str]) -> bool:
    lowered = [w.lower() for w in words]
    if lowered and lowered[0] in _PERIOD_PREFIX:
        lowered = lowered[1:]
    return bool(lowered) and lowered[0] in _PERIODS


def is_proper_noun(name: str) -> bool:
    words = name.split()
    if words and words[0].lower() in _ARTICLES:
        words = words[1:]
    if not words or _starts_with_period(words):
        return False
    named = []
    for i, word in enumerate(words):
        if _capitalised(word):
            named.append(word)
        elif i == 0 or word.lower() not in _CONNECTORS:
            return False
    return any(_core(w) not in _GENERIC for w in named)
