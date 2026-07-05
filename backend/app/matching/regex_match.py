"""Direct-reference regex detection (PDD §6.1 regex step, §3.1, §4).

Catches an unambiguous spoken reference ("John 3:16") instantly, without
touching embeddings -- the fast path tried before falling back to
`search_by_embedding` (PDD: "regex first, embeddings only when regex finds
nothing, keeping the common case fast").
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.data.canonical_books import CANONICAL_BOOKS

_ORDINAL_PREFIXES = {"first": "1", "second": "2", "third": "3"}

# Common alternate names/mishearings beyond the ordinal-number forms handled
# below -- found from real transcript testing (e.g. "Songs of Solomon" for
# the canonical "Song of Solomon") plus other well-known ones worth covering
# proactively rather than waiting to hit each one in testing.
_EXTRA_ALIASES = {
    "songs of solomon": "Song of Solomon",
    "song of songs": "Song of Solomon",
    "psalm": "Psalms",
    "revelations": "Revelation",
}


def _book_alternatives() -> dict[str, str]:
    """Maps every recognized spoken form of a book name to its canonical form.

    Longer names are matched first via alternation order so "1 John" isn't
    shadowed by a bare "John" match eating part of the reference.
    """
    alternatives: dict[str, str] = {}
    for name in CANONICAL_BOOKS:
        alternatives[name.lower()] = name
        if name[0].isdigit():
            digit, rest = name.split(" ", 1)
            ordinal = next(word for word, d in _ORDINAL_PREFIXES.items() if d == digit)
            alternatives[f"{ordinal} {rest}".lower()] = name
    alternatives.update(_EXTRA_ALIASES)
    return alternatives


_BOOK_ALTERNATIVES = _book_alternatives()
_BOOK_PATTERN = "|".join(re.escape(form) for form in sorted(_BOOK_ALTERNATIVES, key=len, reverse=True))

# Punctuation Whisper has been observed substituting for a spoken pause
# between numbers ("Genesis 1-1" for "Genesis 1:1") -- comma and colon were
# the first found missing (real transcript testing), hyphen and en/em dash
# found missing the same way afterward. Hyphen is last in the class so it's
# read literally, not as a range.
_SEPARATOR_CHARS = ",:–—-"

# Two shapes: the compact "Book 3:16" / "Book 3 16" a transcript typically
# renders, and the spoken-out "Book chapter 3 verse 16".
_REFERENCE_RE = re.compile(
    rf"\b(?P<book>{_BOOK_PATTERN})[{_SEPARATOR_CHARS}]?\s+"
    rf"(?:chapter\s+)?(?P<chapter>\d{{1,3}})"
    rf"[{_SEPARATOR_CHARS}]?\s*(?:verse\s+)?(?P<verse>\d{{1,3}})\b",
    re.IGNORECASE,
)


@dataclass
class ParsedReference:
    book: str
    chapter: int
    verse: int


def parse_reference_candidates(text: str) -> list[ParsedReference]:
    """Returns candidate readings in priority order (usually just one).

    A reference with an explicit separator (colon, comma, space, "verse") is
    unambiguous -- exactly one candidate. But a bare 3-digit run with *no*
    separator at all ("John316", from Whisper merging "three sixteen" into
    one number) is genuinely ambiguous between chapter 3 verse 16 and chapter
    31 verse 6, and regex backtracking always produces the 2-digit-chapter
    reading first. That's backwards from how people actually speak
    references -- a single-digit chapter is far more common -- and for a
    book with enough chapters, blindly trusting it produces a *wrong but
    fully-confident* match, which is worse than finding nothing. So this
    returns the more-likely reading first and the literal backtracked one as
    a fallback; the caller (which has DB access) tries them in order and
    keeps the first one that resolves to a real verse.
    """
    match = _REFERENCE_RE.search(text)
    if match is None:
        return []

    canonical_book = _BOOK_ALTERNATIVES[match.group("book").lower()]
    chapter_str, verse_str = match.group("chapter"), match.group("verse")
    no_separator = text[match.end("chapter") : match.start("verse")] == ""

    if no_separator and len(chapter_str) == 2 and len(verse_str) == 1:
        digits = chapter_str + verse_str
        preferred = ParsedReference(book=canonical_book, chapter=int(digits[0]), verse=int(digits[1:]))
        literal = ParsedReference(book=canonical_book, chapter=int(chapter_str), verse=int(verse_str))
        return [preferred, literal]

    return [ParsedReference(book=canonical_book, chapter=int(chapter_str), verse=int(verse_str))]


def parse_reference(text: str) -> ParsedReference | None:
    """The single best-guess reading -- convenience wrapper for callers (or
    tests) that don't need to try DB fallbacks for the ambiguous case."""
    candidates = parse_reference_candidates(text)
    return candidates[0] if candidates else None
