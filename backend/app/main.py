# app/main.py
from contextlib import asynccontextmanager

import psutil
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select

from app.config import settings
from app.data.reading_queue import clear_reading_queue, sync_current_to_reference
from app.data.song_queue import clear_song_queue, sync_song_queue_to_reference
from app.data.verses import SUPPORTED_TRANSLATIONS, load_all_translations
from app.database import AsyncSessionLocal, engine
from app.matching import display_state, llm_cleanup_state
from app.models import Base, Verse
from app.routes import api_router
from app.schemas.reading_queue import ReadingQueueOut
from app.schemas.song_queue import SongQueueOut
from app.ws import manager


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # create_all only creates missing tables, not missing columns on a
        # table that already existed before the column was added (no Alembic
        # in this project yet -- a single nullable column doesn't warrant
        # pulling in a migration framework). Self-healing for both a fresh
        # install (table is created with the column already) and an existing
        # dev database (column gets added in place, existing rows untouched).
        result = await conn.exec_driver_sql("PRAGMA table_info(service_sets)")
        columns = {row[1] for row in result.fetchall()}
        if "default_translation" not in columns:
            await conn.exec_driver_sql("ALTER TABLE service_sets ADD COLUMN default_translation VARCHAR(8)")

        result = await conn.exec_driver_sql("PRAGMA table_info(songs)")
        columns = {row[1] for row in result.fetchall()}
        if "artist" not in columns:
            await conn.exec_driver_sql("ALTER TABLE songs ADD COLUMN artist VARCHAR(200)")

    # Verse data ships with the app (Phase 02) and is loaded once, locally --
    # never fetched live during a service (PDD §2, §5.5).
    async with AsyncSessionLocal() as db:
        count = await db.scalar(select(func.count()).select_from(Verse))
        if count == 0:
            await load_all_translations(db, SUPPORTED_TRANSLATIONS)

    # Both queues are DB-persisted so a mid-service backend restart doesn't
    # lose the operator's place -- but that also meant a fresh app launch
    # could load whatever queue was left active from a previous session (a
    # prior test, or last week's service) and show it as if it were live.
    # A new launch is a new service: start with both queues genuinely empty.
    async with AsyncSessionLocal() as db:
        await clear_reading_queue(db)
    async with AsyncSessionLocal() as db:
        await clear_song_queue(db)

    # The LLM cleanup step runs a local model alongside STT + embeddings on
    # the same machine -- below a free-RAM floor, disable it automatically
    # rather than risk starving the rest of the live pipeline. Checked once
    # at startup, not per-call, since available RAM isn't expected to swing
    # across a service the way it might across a whole machine's uptime.
    available_mb = psutil.virtual_memory().available / (1024 * 1024)
    if available_mb < settings.LLM_CLEANUP_MIN_FREE_RAM_MB:
        llm_cleanup_state.set_auto_disabled(
            f"Only {available_mb:.0f}MB free RAM at startup (needs {settings.LLM_CLEANUP_MIN_FREE_RAM_MB}MB)"
        )

    yield


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_json()
            if data.get("action") == "confirm":
                display_state.record_confirmed(data)
                if data.get("kind") == "verse" and all(k in data for k in ("book", "chapter", "verse")):
                    # Same reading-queue sync as live speech detection
                    # (app/routes/transcript.py) -- confirming a verse
                    # manually (a queue entry clicked directly, a suggestion,
                    # a manual search result) moves the queue's "now reading"
                    # pointer too, one shared function either way.
                    async with AsyncSessionLocal() as db:
                        queue = await sync_current_to_reference(db, data["book"], data["chapter"], data["verse"])
                    if queue is not None:
                        await manager.send_to_all(
                            {"type": "reading_queue", **ReadingQueueOut.model_validate(queue).model_dump()}
                        )
                elif data.get("kind") == "song" and all(k in data for k in ("song_id", "line_number")):
                    # Song-queue equivalent of the above -- confirming a
                    # song line manually (a queue entry clicked, a song
                    # suggestion, a manual search result) moves the song
                    # queue's "now playing" pointer too.
                    async with AsyncSessionLocal() as db:
                        song_queue = await sync_song_queue_to_reference(db, data["song_id"], data["line_number"])
                    if song_queue is not None:
                        await manager.send_to_all(
                            {"type": "song_queue", **SongQueueOut.model_validate(song_queue).model_dump()}
                        )
                await manager.send_to_all(data)
            elif data.get("action") == "blackout":
                # Clears the projector to black without needing a confirm
                # payload -- also clears "currently displayed" tracking on
                # both tracks, since nothing is displayed anymore.
                display_state.clear()
                await manager.send_to_all(data)
    except WebSocketDisconnect:
        manager.disconnect(websocket)


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
