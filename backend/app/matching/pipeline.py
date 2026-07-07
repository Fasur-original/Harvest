"""Regex-then-embeddings matching pipeline.

Two independent tracks, both evaluated on every line: `find_verse_match`
(regex reference detection first, embeddings only as a fallback) and
`find_song_match` (embeddings only -- a song has no fixed-reference shorthand
the way a verse does). Both run regardless of which one the operator is
currently looking at ("Bible mode" vs "Songs mode" in the UI), so switching
modes shows whatever's already been found rather than starting matching over
from scratch -- the frontend just chooses which track's results to surface
in the foreground.
"""

from __future__ import annotations

import asyncio

from app.config import settings
from app.data.service_state import get_active_set
from app.data.verses import get_verse
from app.database import AsyncSessionLocal
from app.matching.regex_match import detect_translation, parse_reference_candidates, parse_reference_sequence
from app.matching.vector_match import MatchCandidate, search_by_vector


async def _finalize_verse_candidate(candidate: MatchCandidate, resolved_translation: str) -> dict:
    """Turns a raw verse `MatchCandidate` into a display-ready dict.

    Every translation's own wording is embedded separately (PDD §5.2), so
    whichever translation's phrasing happens to sit closest to what was
    actually said is whatever wins the KNN search -- not necessarily the one
    this service should be displaying. Re-fetches the same reference in the
    resolved translation, falling back to the translation that actually
    matched only if that exact reference doesn't exist there (versification
    differs by a handful of verses across these four translations -- WEB has
    one more than the other three).
    """
    display_translation, display_text = candidate.translation, candidate.text
    if candidate.translation != resolved_translation:
        async with AsyncSessionLocal() as db:
            preferred = await get_verse(db, candidate.book, candidate.chapter, candidate.verse, resolved_translation)
        if preferred is not None:
            display_translation, display_text = preferred.translation, preferred.text

    return {
        "kind": "verse",
        "book": candidate.book,
        "chapter": candidate.chapter,
        "verse": candidate.verse,
        "translation": display_translation,
        "text": display_text,
        "confidence": candidate.score,
    }


def _song_candidate_dict(candidate: MatchCandidate) -> dict:
    return {
        "kind": "song",
        "song_id": candidate.song_id,
        "line_number": candidate.line_number,
        "text": candidate.text,
        "confidence": candidate.score,
    }


def _dedupe_verses(candidates: list[MatchCandidate]) -> list[MatchCandidate]:
    """Keeps the best-scoring hit per distinct (book, chapter, verse).

    Each of the four translations embeds the same verse's own wording
    separately (PDD §5.2), and near-identical wording across translations of
    the same verse means a KNN search often returns several of them as
    distinct top hits -- without this, a ranked list could show "John 3:16
    (KJV)" and "John 3:16 (ASV)" as two different options when they're the
    same verse, which defeats the point of offering *different* candidates.
    """
    best_per_verse: dict[tuple[str, int, int], MatchCandidate] = {}
    for candidate in candidates:
        key = (candidate.book, candidate.chapter, candidate.verse)
        if key not in best_per_verse or candidate.score > best_per_verse[key].score:
            best_per_verse[key] = candidate
    return list(best_per_verse.values())


async def resolve_translation(text: str) -> tuple[str, list[int]]:
    """Shared context both tracks need: the translation an unnamed verse
    reference should resolve to, and today's uploaded song set (checked
    before the full library -- PDD §10.5). Computed once per line and passed
    into both `find_verse_match` and `find_song_match` rather than each
    re-querying the active service independently.
    """
    async with AsyncSessionLocal() as db:
        active_set = await get_active_set(db)
    todays_song_ids = [song.id for song in active_set.songs] if active_set else []
    resolved_translation = (
        detect_translation(text)
        or (active_set.default_translation if active_set else None)
        or settings.MATCH_DEFAULT_TRANSLATION
    )
    return resolved_translation, todays_song_ids


async def find_verse_match(text: str, query_vector: bytes, resolved_translation: str) -> dict | None:
    """The verse-only track. A multi-reference announcement short-circuits
    straight to `reading_queue_announced`; a single reference resolves via
    regex; anything else falls back to an embedding search scoped to verses
    only (never songs -- that's `find_song_match`'s job).
    """
    sequence = parse_reference_sequence(text)
    if sequence:
        # A preacher naming several references at once (PDD §5.6) -- "Genesis
        # 1:1, then Genesis 10:12, and Romans 8:28" -- takes priority over
        # treating this line as a single reference. Each one is validated
        # against the real database exactly like a single reference is
        # below; anything that doesn't resolve is dropped rather than
        # failing the whole announcement (best-effort partial, same spirit
        # as Phase 07's sheet import).
        async with AsyncSessionLocal() as db:
            valid_references = []
            for reference in sequence:
                verse = await get_verse(db, reference.book, reference.chapter, reference.verse, resolved_translation)
                if verse is not None:
                    valid_references.append((verse.book, verse.chapter, verse.verse))
        if len(valid_references) >= 2:
            return {"kind": "reading_queue_announced", "references": valid_references}
        # Fewer than 2 named references actually resolved -- not a real
        # "read these several passages" moment after all. Falls through to
        # single-reference handling below, same as if no sequence had been
        # detected at all.

    candidates = parse_reference_candidates(text)
    if candidates:
        # Usually one candidate. For a bare 3-digit reference with no
        # separator ("John316"), there are two genuinely ambiguous readings
        # (PDD-safe: try the more likely one, fall back to the other, and if
        # neither resolves to a real verse, this isn't a reference embeddings
        # should guess at either -- return nothing rather than matching on
        # the reference's own words).
        async with AsyncSessionLocal() as db:
            for reference in candidates:
                verse = await get_verse(db, reference.book, reference.chapter, reference.verse, resolved_translation)
                if verse is not None:
                    return {
                        "kind": "verse",
                        "book": verse.book,
                        "chapter": verse.chapter,
                        "verse": verse.verse,
                        "translation": verse.translation,
                        "text": verse.text,
                        "match_type": "regex",
                        "confidence": 1.0,
                    }
        # A book name and chapter/verse-shaped numbers were recognized, but no
        # candidate reading resolved to a real verse. Distinct from "nothing
        # reference-shaped was said at all" below -- the operator console
        # uses this to clear a stale pending suggestion, since the speaker
        # clearly *tried* to name something specific just now.
        return {"kind": "unresolved_reference"}

    loop = asyncio.get_running_loop()
    # Over-fetches (4x) since up to 4 translations of the same verse can each
    # show up as a separate raw hit -- deduped below, so this is "enough raw
    # hits to likely surface MATCH_CANDIDATE_COUNT distinct verses," not the
    # final candidate count.
    verse_candidates = _dedupe_verses(
        await loop.run_in_executor(None, search_by_vector, query_vector, "verses", settings.MATCH_CANDIDATE_COUNT * 4)
    )
    if not verse_candidates:
        return None

    verse_candidates.sort(key=lambda c: -c.score)
    best = verse_candidates[0]
    if best.score < settings.MATCH_CANDIDATE_THRESHOLD:
        return None

    if best.score >= settings.MATCH_CONFIDENCE_THRESHOLD:
        return {**await _finalize_verse_candidate(best, resolved_translation), "match_type": "embedding"}

    # Medium confidence (PDD §6.5): not sure enough to auto-suggest one
    # answer, but too close a cluster of scores to just show nothing either.
    top = verse_candidates[: settings.MATCH_CANDIDATE_COUNT]
    return {
        "kind": "candidates",
        "candidates": [await _finalize_verse_candidate(c, resolved_translation) for c in top],
    }


async def find_song_match(text: str, query_vector: bytes, todays_song_ids: list[int]) -> dict | None:
    """The song-only track. No regex path -- a song has no fixed-reference
    shorthand the way "book chapter:verse" gives a verse, so every song
    match goes through embeddings. Naturally never matches anything if no
    songs have been uploaded yet (an empty index just returns no candidates),
    so there's no separate "only listen for songs that exist" guard needed.
    """
    loop = asyncio.get_running_loop()
    fetch_k = settings.MATCH_CANDIDATE_COUNT

    # Today's uploaded set first -- "almost certainly the source of any line
    # being sung" (PDD §10.5) -- only falling back to the full permanent
    # library if nothing there clears the confidence floor.
    song_candidates: list[MatchCandidate] = []
    if todays_song_ids:
        song_candidates = await loop.run_in_executor(
            None, search_by_vector, query_vector, "songs", fetch_k, todays_song_ids
        )
    if not song_candidates or song_candidates[0].score < settings.MATCH_CONFIDENCE_THRESHOLD:
        song_candidates = await loop.run_in_executor(None, search_by_vector, query_vector, "songs", fetch_k)
    if not song_candidates:
        return None

    song_candidates.sort(key=lambda c: -c.score)
    best = song_candidates[0]
    if best.score < settings.MATCH_CANDIDATE_THRESHOLD:
        return None

    if best.score >= settings.MATCH_CONFIDENCE_THRESHOLD:
        return {**_song_candidate_dict(best), "match_type": "embedding"}

    top = song_candidates[:fetch_k]
    return {"kind": "candidates", "candidates": [_song_candidate_dict(c) for c in top]}
