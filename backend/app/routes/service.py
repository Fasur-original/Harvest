from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.data.service_state import clear_service_set, get_active_set, start_service_set
from app.database import get_db
from app.schemas.service import ServiceSetOut, ServiceSetStart

router = APIRouter(prefix="/service", tags=["service"])


@router.post("/start", response_model=ServiceSetOut)
async def start_set(payload: ServiceSetStart, db: AsyncSession = Depends(get_db)):
    return await start_service_set(db, payload.song_ids)


@router.get("/active", response_model=ServiceSetOut)
async def active_set(db: AsyncSession = Depends(get_db)):
    result = await get_active_set(db)
    if result is None:
        raise HTTPException(status_code=404, detail="No active service set")
    return result


@router.post("/clear", status_code=204)
async def clear_set(db: AsyncSession = Depends(get_db)):
    await clear_service_set(db)
