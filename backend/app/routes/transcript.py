"""Start/stop control for the live transcript feed and the matching
pipeline that runs on each line.

Order tried on every chunk:
0. A translation-comparison request ("show me the strongest rendering of
   this") -- detected and handled entirely separately, since the right
   response is a ranked list of every loaded translation to pick from, not
   a lookup or a suggestion.
1. Regex (app/matching/regex_match.py) -- instant, exact, tried first always.
2. If regex found no direct reference at all: the LLM cleanup step
   (app/matching/llm_cleanup.py) -- a small local model classifies the whole
   chunk into a batch of verse/song items in one pass, since a chunk can
   contain several verses and a song lyric in sequence, not just one thing.
3. If the LLM step is disabled, times out, errors, or returns nothing: the
   existing dual-track embedding fallback (find_verse_match/find_song_match)
   -- unchanged, exactly today's single-best-guess-per-track behavior.

Both the LLM step's items and the dual-track fallback ultimately funnel
through the same `_handle_verse_match`/`_handle_song_match` broadcast logic,
so reading-queue/song-queue sync and "already displayed" suppression behave
identically no matter which path actually resolved the match.
"""

from __future__ import annotations

import asyncio
import sys
from dataclasses import asdict
from pathlib import Path

from fastapi import APIRouter

from app.config import settings
from app.data.reading_queue import create_reading_queue, sync_current_to_reference
from app.data.song_queue import sync_song_queue_to_reference
from app.data.verses import SUPPORTED_TRANSLATIONS, get_verse
from app.database import AsyncSessionLocal
from app.matching import display_state, llm_cleanup
from app.matching.pipeline import find_song_match, find_verse_match, resolve_translation
from app.matching.regex_match import (
    detect_translation_comparison_request,
    parse_reference_candidates,
    parse_reference_sequence,
)
from app.matching.vector_match import embed_query, rank_translations_by_similarity
from app.matching.verse_bounds import validate_reference
from app.schemas.reading_queue import ReadingQueueOut
from app.schemas.song_queue import SongQueueOut
from app.ws import manager

# workers/ sits at the repo root, a sibling of backend/ (PDD §11), not under
# backend/app/ -- put the repo root on sys.path so it's importable in-process
# (§14: desktop folds workers into the backend rather than spawning them).
_REPO_ROOT = Path(__file__).resolve().parents[3]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from workers.stt_worker import STTWorker  # noqa: E402

router = APIRouter(prefix="/transcript", tags=["transcript"])

worker = STTWorker(
    model_size=settings.WHISPER_MODEL_SIZE,
    device=settings.WHISPER_DEVICE,
    compute_type=settings.WHISPER_COMPUTE_TYPE,
    language=settings.WHISPER_LANGUAGE,
    min_chunk_seconds=settings.TRANSCRIPT_MIN_CHUNK_SECONDS,
    max_chunk_seconds=settings.TRANSCRIPT_MAX_CHUNK_SECONDS,
    silence_ms=settings.TRANSCRIPT_SILENCE_MS,
    cpu_threads=settings.WHISPER_CPU_THREADS,
    beam_size=settings.WHISPER_BEAM_SIZE,
)

_broadcast_task: asyncio.Task | None = None


async def _handle_verse_match(match: dict, source_text: str) -> None:
    if match["kind"] == "unresolved_reference":
        # The operator clearly tried to name a reference just now and it
        # didn't resolve -- clear any stale pending suggestion so it doesn't
        # look like it corresponds to what was just said.
        await manager.send_to_all({"type": "no_match"})
        return

    if match["kind"] == "reading_queue_announced":
        # The preacher named several references at once -- build the queue
        # and push it. Doesn't go through the suggestion/confirm path at
        # all, since naming a sequence to read isn't itself a request to
        # display any one of them yet.
        async with AsyncSessionLocal() as db:
            queue = await create_reading_queue(db, match["references"])
        await manager.send_to_all({"type": "reading_queue", **ReadingQueueOut.model_validate(queue).model_dump()})
        return

    if match["kind"] == "verse":
        # Whenever a confident single verse is detected, check whether it's
        # one of the active reading queue's entries and move the "now
        # reading" pointer to it if so (the preacher may read the queue out
        # of the order it was announced in). Runs regardless of the
        # suppression check below -- tracking where the preacher actually is
        # in the queue isn't the same question as whether to bother the
        # operator with another suggestion popup for a verse already on screen.
        async with AsyncSessionLocal() as db:
            queue = await sync_current_to_reference(db, match["book"], match["chapter"], match["verse"])
        if queue is not None:
            await manager.send_to_all({"type": "reading_queue", **ReadingQueueOut.model_validate(queue).model_dump()})

        if display_state.is_currently_displayed_verse(match["book"], match["chapter"], match["verse"]):
            # The preacher is quoting or explaining a verse already
            # confirmed onto the display, not asking for a new lookup --
            # re-suggesting it on every re-quote/paraphrase would just be
            # noise. A genuinely different verse still suggests normally.
            return
        await manager.send_to_all({"type": "suggestion", "source_text": source_text, **match})
        return

    if match["kind"] == "candidates":
        # Same "already displayed" suppression as a single suggestion,
        # applied per-candidate.
        candidates = [
            c
            for c in match["candidates"]
            if not display_state.is_currently_displayed_verse(c["book"], c["chapter"], c["verse"])
        ]
        if candidates:
            await manager.send_to_all({"type": "candidates", "source_text": source_text, "candidates": candidates})


async def _handle_song_match(match: dict, source_text: str) -> None:
    if match["kind"] == "song":
        async with AsyncSessionLocal() as db:
            queue = await sync_song_queue_to_reference(db, match["song_id"], match["line_number"])
        if queue is not None:
            await manager.send_to_all({"type": "song_queue", **SongQueueOut.model_validate(queue).model_dump()})

        if display_state.is_currently_displayed_song(match["song_id"], match["line_number"]):
            # Same reasoning as the verse track -- a repeated chorus line
            # already on screen isn't a new suggestion worth re-popping.
            return
        await manager.send_to_all({"type": "song_suggestion", "source_text": source_text, **match})
        return

    if match["kind"] == "candidates":
        candidates = [
            c
            for c in match["candidates"]
            if not display_state.is_currently_displayed_song(c["song_id"], c["line_number"])
        ]
        if candidates:
            await manager.send_to_all({"type": "song_candidates", "source_text": source_text, "candidates": candidates})


async def _handle_llm_verse_item(item: dict, resolved_translation: str, source_text: str) -> None:
    # item["book"/"chapter"/"verse"] already passed verse_bounds.py's
    # deterministic check -- this only confirms it exists in the target
    # translation specifically (a handful of verses differ across
    # translations, same reasoning as pipeline.py's _finalize_verse_candidate).
    requested_translation = item.get("translation")
    translation_note = None
    target_translation = resolved_translation
    if requested_translation:
        if requested_translation in SUPPORTED_TRANSLATIONS:
            target_translation = requested_translation
        else:
            # A real, recognized translation name that isn't loaded for this
            # install -- fall back to what resolve_translation already
            # resolved to, and flag it, same as the regex path (PDD PART 1:
            # never fail silently or return nothing).
            translation_note = {"requested": requested_translation, "used": resolved_translation}

    async with AsyncSessionLocal() as db:
        verse = await get_verse(db, item["book"], item["chapter"], item["verse"], target_translation)
        if verse is None and target_translation != resolved_translation:
            verse = await get_verse(db, item["book"], item["chapter"], item["verse"], resolved_translation)
    if verse is None:
        return

    match = {
        "kind": "verse",
        "book": verse.book,
        "chapter": verse.chapter,
        "verse": verse.verse,
        "translation": verse.translation,
        "text": verse.text,
        "match_type": "llm",
        "confidence": 1.0,
    }
    if translation_note is not None:
        match["translation_note"] = translation_note
    await _handle_verse_match(match, source_text)


async def _handle_llm_song_item(item: dict, todays_song_ids: list[int], source_text: str) -> None:
    # Reuses find_song_match wholesale (today's-set-first scoping,
    # confidence/candidate thresholds) rather than a second embedding-search
    # implementation -- the LLM step only supplies cleaned_text as the query,
    # it never does its own vector search.
    loop = asyncio.get_running_loop()
    query_vector = await loop.run_in_executor(None, embed_query, item["cleaned_text"])
    song_match = await find_song_match(item["cleaned_text"], query_vector, todays_song_ids)
    if song_match is not None:
        await _handle_song_match(song_match, source_text)


async def _handle_translation_comparison_request(text: str) -> None:
    """"Show me the strongest/clearest/best rendering of this" -- ranks
    every translation loaded for the identified verse by similarity to what
    was just said, and lets the operator pick (PDD PART 2). Never auto-picks
    and pushes the top result -- same confirmation rule as everything else
    in this pipeline.

    The target verse is either named explicitly in this same line ("...of
    Romans 8:28") or, more often given how the phrase is actually used
    ("...of *this*"), whatever's currently confirmed onto the display --
    reuses display_state, which already tracks exactly that.
    """
    target: tuple[str, int, int] | None = None

    for reference in parse_reference_candidates(text):
        validated = await validate_reference(reference.book, reference.chapter, reference.verse)
        if validated is not None:
            target = validated
            break

    if target is None:
        target = display_state.get_current_verse()

    if target is None:
        return

    book, chapter, verse = target
    loop = asyncio.get_running_loop()
    rankings = await loop.run_in_executor(None, rank_translations_by_similarity, book, chapter, verse, text)
    if not rankings:
        return

    await manager.send_to_all(
        {
            "type": "translation_comparison",
            "book": book,
            "chapter": chapter,
            "verse": verse,
            "source_text": text,
            "rankings": [asdict(r) for r in rankings],
        }
    )


async def _broadcast_loop() -> None:
    while True:
        text = await worker.transcript_queue.get()
        await manager.send_to_all({"type": "transcript", "text": text})

        if detect_translation_comparison_request(text):
            # A distinct request shape from a normal reference or song lyric
            # -- handled entirely on its own and never falls through to the
            # regex/LLM/embedding paths below, regardless of whether a
            # target verse and rankings were actually found.
            await _handle_translation_comparison_request(text)
            continue

        resolved_translation, todays_song_ids, translation_note = await resolve_translation(text)

        # Regex first, always -- instant and exact when it finds a direct
        # reference. Checked here (not just inside find_verse_match) so this
        # loop can decide whether the LLM cleanup step below is worth trying.
        has_direct_reference = bool(parse_reference_sequence(text) or parse_reference_candidates(text))

        if not has_direct_reference:
            llm_items = await llm_cleanup.extract_items(text)
            if llm_items:
                for item in llm_items:
                    if item["type"] == "verse":
                        await _handle_llm_verse_item(item, resolved_translation, text)
                    else:
                        await _handle_llm_song_item(item, todays_song_ids, text)
                # The LLM step handled this whole chunk (verses and/or song
                # lyrics) -- skip the embedding fallback below rather than
                # doubly processing the same chunk two different ways.
                continue

        loop = asyncio.get_running_loop()
        # Embed once and reuse for both tracks -- embedding is the expensive
        # part of a search, and re-running it per track wastes a full model
        # pass on every line.
        query_vector = await loop.run_in_executor(None, embed_query, text)

        verse_match, song_match = await asyncio.gather(
            find_verse_match(text, query_vector, resolved_translation),
            find_song_match(text, query_vector, todays_song_ids),
        )

        if verse_match is not None:
            if verse_match.get("kind") == "verse" and translation_note is not None:
                verse_match["translation_note"] = translation_note
            await _handle_verse_match(verse_match, text)
        if song_match is not None:
            await _handle_song_match(song_match, text)


@router.post("/start")
async def start_transcription() -> dict:
    global _broadcast_task
    await worker.start()
    if _broadcast_task is None or _broadcast_task.done():
        _broadcast_task = asyncio.create_task(_broadcast_loop())
    return {"running": True}


@router.post("/stop")
async def stop_transcription() -> dict:
    global _broadcast_task
    await worker.stop()
    if _broadcast_task is not None:
        _broadcast_task.cancel()
        _broadcast_task = None
    return {"running": False}


@router.get("/status")
async def transcript_status() -> dict:
    return {"running": worker.running}
