"""Deterministic bounds check for a book/chapter/verse reference -- the
actual false-positive guard on the LLM cleanup step's output (a small local
model can be talked into confidently repeating its own mistake, so this
can't depend on the model grading itself).

Derived from the real verse data already loaded (Phase 02) rather than a
hand-maintained table of max-chapter/max-verse-per-book -- one source of
truth, and it can't silently drift out of sync with the actual data the app
ships.
"""

from __future__ import annotations

from sqlalchemy import func, select

from app.data.canonical_books import CANONICAL_BOOKS
from app.database import AsyncSessionLocal
from app.matching.regex_match import normalize_book_name
from app.models import Verse

# book -> chapter -> max verse number in that chapter
_bounds: dict[str, dict[int, int]] | None = None


async def _ensure_loaded() -> dict[str, dict[int, int]]:
    global _bounds
    if _bounds is not None:
        return _bounds

    async with AsyncSessionLocal() as db:
        rows = (
            await db.execute(select(Verse.book, Verse.chapter, func.max(Verse.verse)).group_by(Verse.book, Verse.chapter))
        ).all()

    bounds: dict[str, dict[int, int]] = {}
    for book, chapter, max_verse in rows:
        bounds.setdefault(book, {})[chapter] = max_verse
    _bounds = bounds
    return _bounds


async def validate_reference(book: str, chapter: int, verse: int) -> tuple[str, int, int] | None:
    """Returns the normalized `(book, chapter, verse)` if this reference is
    at least plausible (a real canonical book, chapter/verse within that
    book's real range), or `None` if it fails either check. Does not confirm
    the reference actually resolves via `get_verse` -- that's still the
    caller's job, since resolution also depends on which translation is
    active; this only rules out things that can't possibly be real.
    """
    canonical_book = normalize_book_name(book)
    if canonical_book is None or canonical_book not in CANONICAL_BOOKS:
        return None

    bounds = await _ensure_loaded()
    chapters = bounds.get(canonical_book)
    if not chapters or chapter not in chapters:
        return None
    if verse < 1 or verse > chapters[chapter]:
        return None

    return canonical_book, chapter, verse
