import asyncio
import io

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.data.songs import build_song_sheet_template, get_song, parse_song_sheet, save_song, search_songs
from app.database import get_db
from app.matching.vector_match import embed_and_store_song_lines
from app.schemas.song import SheetErrorOut, SongCreate, SongOut, SongSheetImportResult, SongSummary

router = APIRouter(prefix="/songs", tags=["songs"])


@router.get("/template")
async def download_song_sheet_template():
    return StreamingResponse(
        io.BytesIO(build_song_sheet_template()),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="harvest-song-sheet-template.xlsx"'},
    )


@router.post("", response_model=SongOut)
async def create_song(payload: SongCreate, db: AsyncSession = Depends(get_db)):
    lines = [line.model_dump() for line in payload.lines]
    song = await save_song(db, payload.title, lines)
    # Quick-add is a rare, one-song-at-a-time fallback (PDD §10.4) -- embedding
    # immediately here is fine; the bulk upload path below batches instead.
    await asyncio.get_running_loop().run_in_executor(None, embed_and_store_song_lines)
    return song


@router.post("/upload", response_model=SongSheetImportResult)
async def upload_song_sheet(file: UploadFile, db: AsyncSession = Depends(get_db)):
    contents = await file.read()
    parsed = await asyncio.get_running_loop().run_in_executor(
        None, parse_song_sheet, io.BytesIO(contents)
    )

    imported = [await save_song(db, song.title, song.lines) for song in parsed.songs]

    if imported:
        # One batch embedding call for the whole workbook, not one per song --
        # embedding is the expensive step, and a service's workbook is
        # typically several songs at once.
        await asyncio.get_running_loop().run_in_executor(None, embed_and_store_song_lines)

    return SongSheetImportResult(
        imported=[SongSummary.model_validate(song) for song in imported],
        errors=[SheetErrorOut(tab=e.tab, problem=e.problem) for e in parsed.errors],
    )


@router.get("", response_model=list[SongSummary])
async def list_songs(q: str = Query(..., min_length=1), db: AsyncSession = Depends(get_db)):
    return await search_songs(db, q)


@router.get("/{song_id}", response_model=SongOut)
async def read_song(song_id: int, db: AsyncSession = Depends(get_db)):
    song = await get_song(db, song_id)
    if song is None:
        raise HTTPException(status_code=404, detail="Song not found")
    return song
