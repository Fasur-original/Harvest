from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.data.reading_queue import clear_reading_queue
from app.data.service_state import clear_service_set, get_active_set, start_service_set
from app.data.song_queue import clear_song_queue
from app.data.verses import SUPPORTED_TRANSLATIONS
from app.database import get_db
from app.matching import display_state
from app.schemas.service import ServiceSetOut, ServiceSetStart

router = APIRouter(prefix="/service", tags=["service"])


@router.post("/start", response_model=ServiceSetOut)
async def start_set(payload: ServiceSetStart, db: AsyncSession = Depends(get_db)):
    if payload.default_translation is not None and payload.default_translation not in SUPPORTED_TRANSLATIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported translation. Choose one of {SUPPORTED_TRANSLATIONS}")
    # This endpoint doubles as "update" (e.g. just changing the default
    # translation on an already-running service, see OperatorConsole.tsx) --
    # only treat it as a genuinely *new* service, and clear "already
    # displayed" tracking and both queues, when there wasn't an active one
    # already. Otherwise updating the translation mid-service would silently
    # wipe the preacher's in-progress reading queue or the operator's song queue.
    if await get_active_set(db) is None:
        display_state.clear()
        await clear_reading_queue(db)
        await clear_song_queue(db)
    return await start_service_set(db, payload.song_ids, payload.default_translation)


@router.get("/active", response_model=ServiceSetOut)
async def active_set(db: AsyncSession = Depends(get_db)):
    result = await get_active_set(db)
    if result is None:
        raise HTTPException(status_code=404, detail="No active service set")
    return result


@router.post("/clear", status_code=204)
async def clear_set(db: AsyncSession = Depends(get_db)):
    await clear_service_set(db)
    await clear_reading_queue(db)
    await clear_song_queue(db)
    display_state.clear()
