"""Tracks which verse is currently confirmed onto the audience display.

Exists so the live matching loop (`app/routes/transcript.py`) can tell "the
preacher just cited a brand new reference" apart from "the preacher is still
explaining/re-quoting the verse already on screen" -- re-suggesting the exact
same verse on every paraphrase while it's being taught on isn't a new lookup
request, it's noise the operator would have to keep dismissing. Naming a
genuinely different verse, confirming a song, or confirming nothing at all
clears this, so the very next distinct reference is suggested normally again.

Deliberately an in-process module-level singleton, same pattern as `app.ws`'s
`ConnectionManager` and `app/routes/transcript.py`'s `worker` -- this is
live-session state for a single running desktop instance, not something that
needs to survive a restart or be shared across processes.
"""

from __future__ import annotations

_current_verse: tuple[str, int, int] | None = None


def record_confirmed(data: dict) -> None:
    """Called with whatever the operator just confirmed (PDD §9 Phase 6)."""
    global _current_verse
    if data.get("kind") == "verse" and "book" in data and "chapter" in data and "verse" in data:
        _current_verse = (data["book"], data["chapter"], data["verse"])
    else:
        _current_verse = None


def is_currently_displayed_verse(book: str, chapter: int, verse: int) -> bool:
    return _current_verse == (book, chapter, verse)


def clear() -> None:
    global _current_verse
    _current_verse = None
