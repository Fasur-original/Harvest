"""Direct-reference regex detection (PDD §6.1 regex step, §3.1, §4).

Catches an unambiguous spoken reference ("John 3:16") instantly, without
touching embeddings -- the fast path tried before falling back to
`search_by_embedding` (PDD: "regex first, embeddings only when regex finds
nothing, keeping the common case fast").
"""

from __future__ import annotations

import difflib
import re
from dataclasses import dataclass

from app.data.canonical_books import CANONICAL_BOOKS

_ORDINAL_PREFIXES = {"first": "1", "second": "2", "third": "3"}

# Common alternate names/mishearings beyond the ordinal-number forms handled
# below -- found from real transcript testing (e.g. "Songs of Solomon" for
# the canonical "Song of Solomon") plus other well-known ones worth covering
# proactively rather than waiting to hit each one in testing. Genuine
# mishearings of a book name that aren't in this list are handled by the
# fuzzy fallback further down, not by trying to enumerate every variant here.
_EXTRA_ALIASES = {
    "songs of solomon": "Song of Solomon",
    "song of songs": "Song of Solomon",
    "psalm": "Psalms",
    "revelations": "Revelation",
}

# Common written abbreviations (the LLM cleanup step -- app/matching/
# llm_cleanup.py -- is more likely to see these than spoken-out full names,
# since a small model asked to output a book name will often reach for the
# short form it's seen most in training data). Not exhaustive, but covers
# the standard-ish abbreviation for every book, so the same alias map both
# regex matching and LLM-output validation share (`normalize_book_name`
# below) stays the one place book-name variants are enumerated.
_ABBREVIATIONS = {
    "gen": "Genesis", "gn": "Genesis", "exod": "Exodus", "ex": "Exodus", "lev": "Leviticus",
    "lv": "Leviticus", "num": "Numbers", "nm": "Numbers", "deut": "Deuteronomy", "dt": "Deuteronomy",
    "josh": "Joshua", "jos": "Joshua", "judg": "Judges", "jdg": "Judges", "ruth": "Ruth", "ru": "Ruth",
    "1 sam": "1 Samuel", "2 sam": "2 Samuel", "1 kgs": "1 Kings", "1 ki": "1 Kings",
    "2 kgs": "2 Kings", "2 ki": "2 Kings", "1 chr": "1 Chronicles", "1 ch": "1 Chronicles",
    "2 chr": "2 Chronicles", "2 ch": "2 Chronicles", "ezra": "Ezra", "ezr": "Ezra",
    "neh": "Nehemiah", "esth": "Esther", "est": "Esther", "job": "Job", "ps": "Psalms",
    "psa": "Psalms", "psalm": "Psalms", "prov": "Proverbs", "pr": "Proverbs",
    "eccl": "Ecclesiastes", "eccles": "Ecclesiastes", "song": "Song of Solomon", "sos": "Song of Solomon",
    "isa": "Isaiah", "jer": "Jeremiah", "lam": "Lamentations", "ezek": "Ezekiel", "eze": "Ezekiel",
    "dan": "Daniel", "hos": "Hosea", "joel": "Joel", "jl": "Joel", "amos": "Amos", "am": "Amos",
    "obad": "Obadiah", "ob": "Obadiah", "jonah": "Jonah", "jon": "Jonah", "mic": "Micah",
    "nah": "Nahum", "hab": "Habakkuk", "zeph": "Zephaniah", "zep": "Zephaniah", "hag": "Haggai",
    "zech": "Zechariah", "zec": "Zechariah", "mal": "Malachi", "matt": "Matthew", "mt": "Matthew",
    "mark": "Mark", "mk": "Mark", "luke": "Luke", "lk": "Luke", "john": "John", "jn": "John",
    "acts": "Acts", "ac": "Acts", "rom": "Romans", "rm": "Romans", "1 cor": "1 Corinthians",
    "2 cor": "2 Corinthians", "gal": "Galatians", "eph": "Ephesians", "phil": "Philippians",
    "php": "Philippians", "col": "Colossians", "1 thess": "1 Thessalonians", "1 th": "1 Thessalonians",
    "2 thess": "2 Thessalonians", "2 th": "2 Thessalonians", "1 tim": "1 Timothy",
    "2 tim": "2 Timothy", "titus": "Titus", "tit": "Titus", "phlm": "Philemon", "phm": "Philemon",
    "heb": "Hebrews", "james": "James", "jas": "James", "1 pet": "1 Peter", "2 pet": "2 Peter",
    "1 jn": "1 John", "2 jn": "2 John", "3 jn": "3 John", "jude": "Jude", "jd": "Jude",
    "rev": "Revelation",
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


def _build_number_words() -> dict[str, int]:
    """1-999 as spoken words, e.g. "sixteen" -> 16, "twenty-one" -> 21,
    "one hundred and fifty" -> 150.

    Whisper doesn't consistently convert spoken numbers to digits -- small
    numbers in particular ("chapter one, verse one") are often left as words
    (found from real transcript testing). Compounds are stored with both a
    hyphen and a space between the tens/ones word, since Whisper renders that
    boundary inconsistently too (same lesson as the chapter:verse separator).

    Goes up to 999 not because any real reference needs a number that large
    (the highest in the whole Bible is Psalm 119's 176 verses, and Psalms'
    150 chapters), but because generating the full range costs nothing extra
    and doesn't hardcode today's data as a ceiling.
    """
    ones = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine"]
    teens = [
        "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
        "sixteen", "seventeen", "eighteen", "nineteen",
    ]
    tens = ["twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]

    under_100: dict[str, int] = {}
    for i, w in enumerate(ones, start=1):
        under_100[w] = i
    for i, w in enumerate(teens, start=10):
        under_100[w] = i
    for ti, tw in enumerate(tens, start=2):
        base = ti * 10
        under_100[tw] = base
        for i, w in enumerate(ones, start=1):
            under_100[f"{tw}-{w}"] = base + i
            under_100[f"{tw} {w}"] = base + i

    words: dict[str, int] = dict(under_100)
    for h in range(1, 10):
        base = h * 100
        words[f"{ones[h - 1]} hundred"] = base
        for form, value in under_100.items():
            words[f"{ones[h - 1]} hundred {form}"] = base + value
            words[f"{ones[h - 1]} hundred and {form}"] = base + value
    return words


_NUMBER_WORDS = _build_number_words()
_NUMBER_WORD_PATTERN = "|".join(re.escape(w) for w in sorted(_NUMBER_WORDS, key=len, reverse=True))
_NUMBER_PATTERN = rf"(?:\d{{1,3}}|{_NUMBER_WORD_PATTERN})"


def _number_value(s: str) -> int:
    return int(s) if s.isdigit() else _NUMBER_WORDS[s.lower()]


# Punctuation Whisper has been observed substituting for a spoken pause
# between numbers ("Genesis 1-1" for "Genesis 1:1") -- comma and colon were
# the first found missing (real transcript testing), hyphen and en/em dash
# found missing the same way afterward. Hyphen is last in the class so it's
# read literally, not as a range.
_SEPARATOR_CHARS = ",:–—-"

# Two shapes: the compact "Book 3:16" / "Book 3 16" a transcript typically
# renders, and the spoken-out "Book chapter three verse sixteen".
_REFERENCE_RE = re.compile(
    rf"\b(?P<book>{_BOOK_PATTERN})[{_SEPARATOR_CHARS}]?\s+"
    rf"(?:chapter\s+)?(?P<chapter>{_NUMBER_PATTERN})"
    rf"[{_SEPARATOR_CHARS}]?\s*(?:verse\s+)?(?P<verse>{_NUMBER_PATTERN})\b",
    re.IGNORECASE,
)

# Fallback for a book name Whisper mis-transcribed altogether ("Revealitions"
# for "Revelation") -- same reference shape, but the book slot accepts any
# word (plus an optional leading ordinal/digit for numbered books), fuzzy-
# matched against known book names afterward rather than required to match
# one exactly. Only tried when the exact pass above finds nothing, and only
# accepted above a similarity floor, so it doesn't turn arbitrary phrases
# with two nearby numbers into false reference detections.
_LENIENT_REFERENCE_RE = re.compile(
    rf"\b(?:(?P<ordinal>1|2|3|first|second|third)\s+)?(?P<book_guess>[A-Za-z]+)"
    rf"[{_SEPARATOR_CHARS}]?\s+"
    rf"(?:chapter\s+)?(?P<chapter>{_NUMBER_PATTERN})"
    rf"[{_SEPARATOR_CHARS}]?\s*(?:verse\s+)?(?P<verse>{_NUMBER_PATTERN})\b",
    re.IGNORECASE,
)
_FUZZY_CUTOFF = 0.75
# Some *different* real books are themselves close enough to trip the cutoff
# above -- found by checking every book against every other, not assumed:
# Jude/Judges (0.80), Zechariah/Zephaniah (0.78), Jeremiah/Nehemiah (0.75).
# A fixed cutoff can't safely separate "should match" from "must not match"
# here -- "revealitions" needs 0.75+ to reach "Revelation" at all, and that's
# *below* Jude-vs-Judges. So the real safeguard is a margin: only trust the
# top candidate if it clearly beats the next-best *different* book, not just
# clears the floor. A garbled word that's roughly equidistant between two
# real, different books is genuinely ambiguous and shouldn't be guessed at
# either way -- falling through to embedding search (which considers the
# full semantic content, not just the reference-shaped fragment) is safer
# than picking one.
_FUZZY_MARGIN = 0.15


def _fuzzy_match_book(guess: str) -> str | None:
    guess = guess.lower()
    # Best similarity per *distinct canonical book*, not per alias form --
    # "revelation" and "revelations" are two forms of the same book and must
    # not count as two competing candidates against each other when checking
    # the margin below.
    best_per_book: dict[str, float] = {}
    for form, canonical in _BOOK_ALTERNATIVES.items():
        ratio = difflib.SequenceMatcher(None, guess, form).ratio()
        if ratio > best_per_book.get(canonical, 0.0):
            best_per_book[canonical] = ratio

    ranked = sorted(best_per_book.items(), key=lambda kv: -kv[1])
    if not ranked or ranked[0][1] < _FUZZY_CUTOFF:
        return None
    if len(ranked) > 1 and ranked[0][1] - ranked[1][1] < _FUZZY_MARGIN:
        return None

    return ranked[0][0]


def normalize_book_name(name: str) -> str | None:
    """Maps any recognized spoken/written form of a book name -- including
    common written abbreviations ("Rom", "1 Cor") the LLM cleanup step
    (app/matching/llm_cleanup.py) is more likely to output than a
    spelled-out full name -- to its canonical form. Returns `None` if the
    name isn't recognized at all.

    Deliberately does *not* feed `_ABBREVIATIONS` into the live regex
    scanning path's book pattern (`_BOOK_PATTERN`) -- some abbreviations
    here ("song" for Song of Solomon) are also ordinary English words,
    which is a real false-positive risk when scanning raw transcript text
    for a reference shape, but not when validating one already-isolated
    field an LLM was explicitly asked to fill with a book name.
    """
    key = name.strip().lower()
    return _BOOK_ALTERNATIVES.get(key) or _ABBREVIATIONS.get(key)


# A spoken translation name alongside a reference (PDD §8: "John 3:16 in the
# King James"). Requires a lead-in phrase ("in the", "from the", "using the")
# rather than matching the bare name anywhere in the line -- "WEB" in
# particular is also an ordinary English word ("a web of lies"), and without
# the lead-in requirement, unrelated speech containing that word would be
# misread as a translation callout. The other three abbreviations aren't real
# words, but the same lead-in requirement is applied uniformly rather than
# carving out a special case per alias.
_TRANSLATION_ALIASES = {
    "kjv": "KJV",
    "king james": "KJV",
    "king james version": "KJV",
    "asv": "ASV",
    "american standard": "ASV",
    "american standard version": "ASV",
    "ylt": "YLT",
    "young's literal": "YLT",
    "youngs literal": "YLT",
    "young's literal translation": "YLT",
    "youngs literal translation": "YLT",
    "web": "WEB",
    "world english bible": "WEB",
    # Not currently loaded in the verses table (SUPPORTED_TRANSLATIONS in
    # app/data/verses.py is still just the four public-domain ones above --
    # copyrighted translations remain out of scope pending licensing, per
    # Phase 08). Recognized by name anyway, so naming one of these triggers
    # the documented fallback-to-default-and-flag behavior (see
    # resolve_translation in pipeline.py) instead of the reference silently
    # failing to resolve or being misread as something else.
    "esv": "ESV",
    "english standard version": "ESV",
    "niv": "NIV",
    "new international version": "NIV",
    "nasb": "NASB",
    "new american standard": "NASB",
    "new american standard bible": "NASB",
    "nlt": "NLT",
    "new living translation": "NLT",
    "nkjv": "NKJV",
    "new king james": "NKJV",
    "new king james version": "NKJV",
    "tpt": "TPT",
    "the passion translation": "TPT",
    "passion translation": "TPT",
    "msg": "MSG",
    "the message": "MSG",
    "message translation": "MSG",
    "the message translation": "MSG",
}

# "WEB" and "message" are themselves ordinary English words ("a web of
# lies," "I have a message for you") -- these two specifically keep
# requiring the full "in/from/using the ___" lead-in so unrelated speech
# doesn't misfire. Every other alias here -- an abbreviation nobody says by
# accident (YLT, KJV, TPT, MSG...) or a multi-word full name that's already
# self-disambiguating ("world english bible") -- doesn't carry that same
# collision risk, and requiring a literal "the" for those was too strict:
# real speech drops the article constantly ("read that in YLT," "switch to
# KJV"), and that lead-in mismatch is exactly what silently failed to
# recognize a spoken "YLT" instead of switching to it.
_STRICT_LEAD_IN_ALIASES = {"web", "message"}
_LOOSE_PATTERN = "|".join(
    re.escape(form) for form in sorted(_TRANSLATION_ALIASES, key=len, reverse=True) if form not in _STRICT_LEAD_IN_ALIASES
)
_STRICT_PATTERN = "|".join(re.escape(form) for form in sorted(_STRICT_LEAD_IN_ALIASES, key=len, reverse=True))
_TRANSLATION_RE = re.compile(
    rf"\b(?:in|from|using|to)\s+(?:the\s+)?(?P<loose>{_LOOSE_PATTERN})\b"
    rf"|\b(?:in|from|using)\s+the\s+(?P<strict>{_STRICT_PATTERN})\b",
    re.IGNORECASE,
)


def detect_translation(text: str) -> str | None:
    """Finds an explicitly named translation anywhere in the line.

    Independent of `parse_reference_candidates` -- the translation name
    doesn't have to sit right next to the reference itself ("Turn to John
    3:16. Let's read that in the King James.").
    """
    match = _TRANSLATION_RE.search(text)
    if match is None:
        return None
    token = match.group("loose") or match.group("strict")
    return _TRANSLATION_ALIASES[token.lower()]


def normalize_translation_name(name: str) -> str | None:
    """Maps a translation name/abbreviation already isolated as its own
    field (the LLM cleanup step's structured output) to its canonical code.
    Unlike `detect_translation`, doesn't require the "in/from/using the"
    lead-in phrase -- there's no free-text false-positive risk when
    validating one field a model was explicitly asked to fill with a
    translation name, same reasoning as `normalize_book_name` vs the live
    regex scanning path.
    """
    return _TRANSLATION_ALIASES.get(name.strip().lower())


# A request to compare translations for a verse ("show me the strongest
# rendering of this," "which version captures this best") -- distinct from
# a normal reference request, since the right response is a ranked list to
# pick from, not a single lookup. Deliberately narrow phrasing (translation/
# rendering/version + strongest/clearest/best/closest, or the "which
# translation captures..." form) rather than matching on "strongest" or
# "best" alone, which show up in ordinary sermon speech ("the strongest
# argument," "his best friend") with nothing to do with comparing translations.
_TRANSLATION_COMPARISON_RE = re.compile(
    r"\b(?:strongest|clearest|best|closest)\s+(?:translation|rendering|version)\b"
    r"|\bwhich\s+(?:translation|version)\s+captures?\s+(?:this|it)\b",
    re.IGNORECASE,
)


def detect_translation_comparison_request(text: str) -> bool:
    return bool(_TRANSLATION_COMPARISON_RE.search(text))


@dataclass
class ParsedReference:
    book: str
    chapter: int
    verse: int


def _candidates_from_match(canonical_book: str, chapter_str: str, verse_str: str, text: str, match: re.Match) -> list[ParsedReference]:
    # The ambiguous-3-digit-run case ("John316") only applies to bare digits
    # run together with no separator at all -- spelled-out numbers are always
    # space/hyphen-delimited, so there's no equivalent ambiguity for them.
    no_separator = text[match.end("chapter") : match.start("verse")] == ""
    if no_separator and chapter_str.isdigit() and verse_str.isdigit() and len(chapter_str) == 2 and len(verse_str) == 1:
        digits = chapter_str + verse_str
        preferred = ParsedReference(book=canonical_book, chapter=int(digits[0]), verse=int(digits[1:]))
        literal = ParsedReference(book=canonical_book, chapter=int(chapter_str), verse=int(verse_str))
        return [preferred, literal]

    return [ParsedReference(book=canonical_book, chapter=_number_value(chapter_str), verse=_number_value(verse_str))]


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
    if match is not None:
        canonical_book = _BOOK_ALTERNATIVES[match.group("book").lower()]
        return _candidates_from_match(canonical_book, match.group("chapter"), match.group("verse"), text, match)

    match = _LENIENT_REFERENCE_RE.search(text)
    if match is None:
        return []

    guess = match.group("book_guess")
    if match.group("ordinal"):
        ordinal = match.group("ordinal").lower()
        digit = ordinal if ordinal.isdigit() else _ORDINAL_PREFIXES[ordinal]
        guess = f"{digit} {guess}"
    canonical_book = _fuzzy_match_book(guess)
    if canonical_book is None:
        return []

    return _candidates_from_match(canonical_book, match.group("chapter"), match.group("verse"), text, match)


def parse_reference(text: str) -> ParsedReference | None:
    """The single best-guess reading -- convenience wrapper for callers (or
    tests) that don't need to try DB fallbacks for the ambiguous case."""
    candidates = parse_reference_candidates(text)
    return candidates[0] if candidates else None


def parse_reference_sequence(text: str) -> list[ParsedReference]:
    """Detects two or more references named in the same utterance (PDD §5.6:
    "Genesis 1:1, then Genesis 10:12, and Romans 8:28"), for the reading
    queue. A single reference is `parse_reference_candidates`'s job, not this
    one -- this returns an empty list whenever fewer than 2 are found, so a
    caller can treat that as "not a sequence" without a separate count check.

    Reuses the same reference primitives `parse_reference_candidates` is
    built on (`_REFERENCE_RE`, `_candidates_from_match`) rather than a second
    parser, per this phase's own guardrail. Only the strict, exact-book-name
    pattern is scanned per slot, not the fuzzy mishearing fallback -- a
    preacher deliberately listing several verses to read is, in practice,
    clearer speech than a single mumbled reference, and scanning one
    utterance for multiple *fuzzy* matches compounds false-positive risk in a
    way a single fuzzy match doesn't. For the rare bare-3-digit ambiguous
    slot ("Genesis 316"), only the more-likely reading is kept -- trying every
    combination across multiple ambiguous slots isn't worth the complexity
    when the caller validates every reference against the real database
    anyway and drops whatever doesn't resolve.
    """
    matches = list(_REFERENCE_RE.finditer(text))
    if len(matches) < 2:
        return []

    references = []
    for match in matches:
        canonical_book = _BOOK_ALTERNATIVES[match.group("book").lower()]
        candidates = _candidates_from_match(canonical_book, match.group("chapter"), match.group("verse"), text, match)
        references.append(candidates[0])
    return references
