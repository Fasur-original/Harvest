from fastapi import APIRouter

from app.routes.bible import router as bible_router
from app.routes.reading_queue import router as reading_queue_router
from app.routes.service import router as service_router
from app.routes.songs import router as songs_router
from app.routes.transcript import router as transcript_router

api_router = APIRouter()
api_router.include_router(bible_router)
api_router.include_router(songs_router)
api_router.include_router(service_router)
api_router.include_router(reading_queue_router)
api_router.include_router(transcript_router)
