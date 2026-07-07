"""Regex-then-embeddings matching pipeline (PDD §3.1, §4, §9 Phase 4).

Regex is tried first (instant, exact); embeddings only run when regex finds
nothing. Below the candidate floor, nothing is suggested at all -- falls back
to manual search (Phase 03), matching the PDD's explicit "show nothing"
behavior when even a rough guess isn't warranted.
"""

from __future__ import annotations

import asyncio

from app.config import settings
from app.data.service_state import get_active_set
from app.data.verses import get_verse
from app.database import AsyncSessionLocal
from app.matching.regex_match import detect_translation, parse_reference_candidates, parse_reference_sequence
from app.matching.vector_match import MatchCandidate, embed_query, search_by_vector


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


async def _finalize_candidate(candidate: MatchCandidate, resolved_translation: str) -> dict:
    if candidate.kind == "songs":
        return {
            "kind": "song",
            "song_id": candidate.song_id,
            "line_number": candidate.line_number,
            "text": candidate.text,
            "confidence": candidate.score,
        }
    return await _finalize_verse_candidate(candidate, resolved_translation)


async def find_match(text: str) -> dict | None:
    async with AsyncSessionLocal() as db:
        active_set = await get_active_set(db)
    todays_song_ids = [song.id for song in active_set.songs] if active_set else []

    # Which translation an unnamed reference resolves to (PDD §8): an
    # explicit "in the King James" in this exact line wins outright;
    # otherwise fall back to today's service default (set at /service/start),
    # then the install-wide .env default. Same "today's context first, then
    # the permanent default" precedence already used for song scoping below.
    resolved_translation = (
        detect_translation(text)
        or (active_set.default_translation if active_set else None)
        or settings.MATCH_DEFAULT_TRANSLATION
    )

    sequence = parse_reference_sequence(text)
    if sequence:
        # A preacher naming several references at once (PDD §5.6) -- "Genesis
        # 1:1, then Genesis 10:12, and Romans 8:28" -- takes priority over
        # treating this line as a single reference, so all of them become a
        # reading queue instead of just whichever one the single-reference
        # regex happened to find first. Each one is validated against the
        # real database exactly like a single reference is below; a name that
        # doesn't resolve to a real verse (bad chapter/verse) is dropped
        # rather than failing the whole announcement (same best-effort
        # partial spirit as Phase 07's sheet import).
        async with AsyncSessionLocal() as db:
            valid_references = []
            for reference in sequence:
                verse = await get_verse(db, reference.book, reference.chapter, reference.verse, resolved_translation)
                if verse is not None:
                    valid_references.append((verse.book, verse.chapter, verse.verse))
        if len(valid_references) >= 2:
            return {"kind": "reading_queue_announced", "references": valid_references}
        # Fewer than 2 of the named references actually resolved -- not a
        # real "read these several passages" moment after all. Falls through
        # to single-reference handling below, same as if no sequence had been
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
        # candidate reading resolved to a real verse (bad chapter/verse, or an
        # unsupported separator regex doesn't cover yet). Distinct from
        # "nothing reference-shaped was said at all" below -- the operator
        # console uses this to clear a stale pending suggestion, since the
        # speaker clearly *tried* to name something specific just now. It must
        # NOT fire on ordinary continued speech (which has no recognized book
        # name at all), or a suggestion still awaiting confirmation would get
        # yanked out from under the operator mid-thought.
        return {"kind": "unresolved_reference"}

    loop = asyncio.get_running_loop()
    # Embed once and reuse for both scopes -- embedding is the expensive part
    # of a search, and re-running it per scope on identical input wastes a
    # full model pass on every line that doesn't regex-match, which is most
    # ordinary speech during a live service.
    query_vector = await loop.run_in_executor(None, embed_query, text)

    # Fetch enough of each scope to cover the ranked-candidate case (PDD
    # §6.5) below, not just the single best match -- a preacher who
    # paraphrases a half-remembered verse (wrong book in mind, garbled
    # wording, no reference at all) is exactly the case a single best-guess
    # isn't confident enough to act on alone.
    fetch_k = settings.MATCH_CANDIDATE_COUNT

    # Verse search has no per-service scoping (shared across every install),
    # so it can run fully in parallel with whatever the song search below
    # ends up doing. Over-fetches (4x) since up to 4 translations of the same
    # verse can each show up as a separate raw hit -- deduped below, so this
    # is "enough raw hits to likely surface fetch_k distinct verses," not the
    # final candidate count.
    verse_task = loop.run_in_executor(None, search_by_vector, query_vector, "verses", fetch_k * 4)

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

    verse_candidates = _dedupe_verses(await verse_task)
    all_candidates = sorted(verse_candidates + song_candidates, key=lambda c: -c.score)
    if not all_candidates:
        return None

    best = all_candidates[0]
    if best.score < settings.MATCH_CANDIDATE_THRESHOLD:
        return None

    if best.score >= settings.MATCH_CONFIDENCE_THRESHOLD:
        if best.kind == "verses":
            return {**await _finalize_verse_candidate(best, resolved_translation), "match_type": "embedding"}
        return {
            "kind": "song",
            "song_id": best.song_id,
            "line_number": best.line_number,
            "text": best.text,
            "match_type": "embedding",
            "confidence": best.score,
        }

    # Medium confidence (PDD §6.5): not sure enough to auto-suggest one
    # answer, but too close a cluster of scores to just show nothing either.
    # Let the operator pick from a short ranked list instead of guessing for
    # them -- this is what "the preacher can't quite recall the book, verse,
    # or exact wording" looks like from the matcher's side: several
    # candidates sit close together with none of them a clear standout.
    top = all_candidates[:fetch_k]
    return {
        "kind": "candidates",
        "candidates": [await _finalize_candidate(c, resolved_translation) for c in top],
    }
