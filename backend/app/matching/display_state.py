"""Tracks which verse or song line is currently confirmed onto the audience
display.

Exists so the live matching loop (`app/routes/transcript.py`) can tell "the
preacher just cited a brand new reference" apart from "the preacher is still
explaining/re-quoting the verse already on screen" -- re-suggesting the exact
same verse (or the same song line, for a repeated chorus) on every
paraphrase/repeat while it's already up isn't a new lookup request, it's
noise the operator would have to keep dismissing. Naming a genuinely
different verse, confirming a song line, or a blackout all clear the
now-stale side of this, so the very next distinct reference is suggested
normally again.

Deliberately an in-process module-level singleton, same pattern as `app.ws`'s
`ConnectionManager` and `app/routes/transcript.py`'s `worker` -- this is
live-session state for a single running desktop instance, not something that
needs to survive a restart or be shared across processes.
"""

from __future__ import annotations

_current_verse: tuple[str, int, int] | None = None
_current_song: tuple[int, int] | None = None  # (song_id, line_number)


def record_confirmed(data: dict) -> None:
    """Called with whatever the operator just confirmed."""
    global _current_verse, _current_song
    kind = data.get("kind")
    if kind == "verse" and "book" in data and "chapter" in data and "verse" in data:
        _current_verse = (data["book"], data["chapter"], data["verse"])
        _current_song = None
    elif kind == "song" and "song_id" in data and "line_number" in data:
        _current_song = (data["song_id"], data["line_number"])
        _current_verse = None
    else:
        # A song confirmed without a line_number (e.g. a title-search
        # confirm that only ever shows line 1 without saying so explicitly)
        # or any other shape -- don't guess, just clear both rather than
        # track something that might be wrong.
        _current_verse = None
        _current_song = None


def is_currently_displayed_verse(book: str, chapter: int, verse: int) -> bool:
    return _current_verse == (book, chapter, verse)


def is_currently_displayed_song(song_id: int, line_number: int) -> bool:
    return _current_song == (song_id, line_number)


def clear() -> None:
    global _current_verse, _current_song
    _current_verse = None
    _current_song = None
