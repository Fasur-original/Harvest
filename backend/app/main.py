# app/main.py
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select

from app.config import settings
from app.data.verses import SUPPORTED_TRANSLATIONS, load_all_translations
from app.database import AsyncSessionLocal, engine
from app.models import Base, Verse
from app.routes import api_router
from app.ws import manager


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

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
                await manager.send_to_all(data)
    except WebSocketDisconnect:
        manager.disconnect(websocket)


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
