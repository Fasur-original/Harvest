from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.data.reading_queue import clear_reading_queue, get_active_queue
from app.database import get_db
from app.schemas.reading_queue import ReadingQueueOut

router = APIRouter(prefix="/reading-queue", tags=["reading-queue"])


@router.get("/active", response_model=ReadingQueueOut)
async def active_queue(db: AsyncSession = Depends(get_db)):
    queue = await get_active_queue(db)
    if queue is None:
        raise HTTPException(status_code=404, detail="No active reading queue")
    return queue


@router.post("/clear", status_code=204)
async def clear_queue(db: AsyncSession = Depends(get_db)):
    await clear_reading_queue(db)
