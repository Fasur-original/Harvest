"""Regex-then-embeddings matching pipeline (PDD §3.1, §4, §9 Phase 4).

Regex is tried first (instant, exact); embeddings only run when regex finds
nothing. Below the confidence floor, nothing is suggested -- falls back to
manual search (Phase 03), matching the PDD's explicit "show nothing" behavior
for low-confidence cases.

This is single-best-match behavior only (PDD §9 Phase 4) -- ranked multi-
candidate output is Phase 09's job, not this one.
"""

from __future__ import annotations

import asyncio

from app.config import settings
from app.data.verses import get_verse
from app.database import AsyncSessionLocal
from app.matching.regex_match import parse_reference_candidates
from app.matching.vector_match import search_by_embedding


async def find_match(text: str) -> dict | None:
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
                verse = await get_verse(
                    db, reference.book, reference.chapter, reference.verse, settings.MATCH_DEFAULT_TRANSLATION
                )
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
        return None

    loop = asyncio.get_running_loop()
    verse_candidates, song_candidates = await asyncio.gather(
        loop.run_in_executor(None, search_by_embedding, text, "verses", 1),
        loop.run_in_executor(None, search_by_embedding, text, "songs", 1),
    )
    candidates = verse_candidates + song_candidates
    if not candidates:
        return None

    best = max(candidates, key=lambda c: c.score)
    if best.score < settings.MATCH_CONFIDENCE_THRESHOLD:
        return None

    if best.kind == "verses":
        return {
            "kind": "verse",
            "book": best.book,
            "chapter": best.chapter,
            "verse": best.verse,
            "translation": best.translation,
            "text": best.text,
            "match_type": "embedding",
            "confidence": best.score,
        }

    return {
        "kind": "song",
        "song_id": best.song_id,
        "line_number": best.line_number,
        "text": best.text,
        "match_type": "embedding",
        "confidence": best.score,
    }
