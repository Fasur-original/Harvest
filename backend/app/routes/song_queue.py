from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.data.song_queue import add_to_song_queue, clear_song_queue, get_active_song_queue, remove_song_queue_entry
from app.data.songs import get_song
from app.database import get_db
from app.schemas.song_queue import SongQueueAdd, SongQueueOut

router = APIRouter(prefix="/song-queue", tags=["song-queue"])


@router.post("/add", response_model=SongQueueOut)
async def add_song(payload: SongQueueAdd, db: AsyncSession = Depends(get_db)):
    song = await get_song(db, payload.song_id)
    if song is None:
        raise HTTPException(status_code=404, detail="Song not found")
    return await add_to_song_queue(db, payload.song_id)


@router.get("/active", response_model=SongQueueOut)
async def active_song_queue(db: AsyncSession = Depends(get_db)):
    queue = await get_active_song_queue(db)
    if queue is None:
        raise HTTPException(status_code=404, detail="No active song queue")
    return queue


@router.delete("/entries/{entry_id}", status_code=204)
async def remove_entry(entry_id: int, db: AsyncSession = Depends(get_db)):
    await remove_song_queue_entry(db, entry_id)


@router.post("/clear", status_code=204)
async def clear_queue(db: AsyncSession = Depends(get_db)):
    await clear_song_queue(db)
