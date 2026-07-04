from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.data.songs import get_song, save_song, search_songs
from app.database import get_db
from app.schemas.song import SongCreate, SongOut, SongSummary

router = APIRouter(prefix="/songs", tags=["songs"])


@router.post("", response_model=SongOut)
async def create_song(payload: SongCreate, db: AsyncSession = Depends(get_db)):
    lines = [line.model_dump() for line in payload.lines]
    return await save_song(db, payload.title, lines)


@router.get("", response_model=list[SongSummary])
async def list_songs(q: str = Query(..., min_length=1), db: AsyncSession = Depends(get_db)):
    return await search_songs(db, q)


@router.get("/{song_id}", response_model=SongOut)
async def read_song(song_id: int, db: AsyncSession = Depends(get_db)):
    song = await get_song(db, song_id)
    if song is None:
        raise HTTPException(status_code=404, detail="Song not found")
    return song
