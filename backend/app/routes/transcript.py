"""Start/stop control for the live transcript feed and the dual-track
matching pipeline that runs on each line -- one verse track, one song track,
both evaluated on every line regardless of which one the operator currently
has in the foreground (see app/matching/pipeline.py's module docstring).
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

from fastapi import APIRouter

from app.config import settings
from app.data.reading_queue import create_reading_queue, sync_current_to_reference
from app.data.song_queue import sync_song_queue_to_reference
from app.database import AsyncSessionLocal
from app.matching import display_state
from app.matching.pipeline import find_song_match, find_verse_match, resolve_translation
from app.matching.vector_match import embed_query
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


async def _handle_verse_match(match: dict) -> None:
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
        await manager.send_to_all({"type": "suggestion", **match})
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
            await manager.send_to_all({"type": "candidates", "candidates": candidates})


async def _handle_song_match(match: dict) -> None:
    if match["kind"] == "song":
        async with AsyncSessionLocal() as db:
            queue = await sync_song_queue_to_reference(db, match["song_id"], match["line_number"])
        if queue is not None:
            await manager.send_to_all({"type": "song_queue", **SongQueueOut.model_validate(queue).model_dump()})

        if display_state.is_currently_displayed_song(match["song_id"], match["line_number"]):
            # Same reasoning as the verse track -- a repeated chorus line
            # already on screen isn't a new suggestion worth re-popping.
            return
        await manager.send_to_all({"type": "song_suggestion", **match})
        return

    if match["kind"] == "candidates":
        candidates = [
            c
            for c in match["candidates"]
            if not display_state.is_currently_displayed_song(c["song_id"], c["line_number"])
        ]
        if candidates:
            await manager.send_to_all({"type": "song_candidates", "candidates": candidates})


async def _broadcast_loop() -> None:
    while True:
        text = await worker.transcript_queue.get()
        await manager.send_to_all({"type": "transcript", "text": text})

        resolved_translation, todays_song_ids = await resolve_translation(text)

        loop = asyncio.get_running_loop()
        # Embed once and reuse for both tracks -- embedding is the expensive
        # part of a search, and re-running it per track wastes a full model
        # pass on every line. Needed unconditionally now (not just when regex
        # finds nothing), since the song track always needs it regardless of
        # whether the verse track resolves via the cheaper regex path.
        query_vector = await loop.run_in_executor(None, embed_query, text)

        verse_match, song_match = await asyncio.gather(
            find_verse_match(text, query_vector, resolved_translation),
            find_song_match(text, query_vector, todays_song_ids),
        )

        if verse_match is not None:
            await _handle_verse_match(verse_match)
        if song_match is not None:
            await _handle_song_match(song_match)


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
