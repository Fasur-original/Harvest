"""Start/stop control for the live transcript feed (Phase 04) and the
regex-then-embeddings matching pipeline that runs on each line (Phase 05).
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

from fastapi import APIRouter

from app.config import settings
from app.matching.pipeline import find_match
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
)

_broadcast_task: asyncio.Task | None = None


async def _broadcast_loop() -> None:
    while True:
        text = await worker.transcript_queue.get()
        await manager.send_to_all({"type": "transcript", "text": text})

        match = await find_match(text)
        if match is not None:
            await manager.send_to_all({"type": "suggestion", **match})


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
