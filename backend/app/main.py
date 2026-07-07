# app/main.py
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select

from app.config import settings
from app.data.reading_queue import sync_current_to_reference
from app.data.verses import SUPPORTED_TRANSLATIONS, load_all_translations
from app.database import AsyncSessionLocal, engine
from app.matching import display_state
from app.models import Base, Verse
from app.routes import api_router
from app.schemas.reading_queue import ReadingQueueOut
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

    # Verse data ships with the app (Phase 02) and is loaded once, locally --
    # never fetched live during a service (PDD §2, §5.5).
    async with AsyncSessionLocal() as db:
        count = await db.scalar(select(func.count()).select_from(Verse))
        if count == 0:
            await load_all_translations(db, SUPPORTED_TRANSLATIONS)

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
                await manager.send_to_all(data)
    except WebSocketDisconnect:
        manager.disconnect(websocket)


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
