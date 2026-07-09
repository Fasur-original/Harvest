import asyncio
import io

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.data.songs import (
    build_flat_import_template,
    build_song_sheet_template,
    get_song,
    parse_song_import,
    save_song,
    search_songs,
)
from app.database import get_db
from app.matching.vector_match import embed_and_store_song_lines
from app.schemas.song import (
    SheetErrorOut,
    SongCreate,
    SongImportCommitRequest,
    SongImportCommitResult,
    SongImportPreview,
    SongImportRow,
    SongOut,
    SongSummary,
)

router = APIRouter(prefix="/songs", tags=["songs"])


@router.get("/template")
async def download_song_sheet_template():
    """Tab-per-song workbook template (Phase 07) -- still supported, best
    suited to a handful of songs prepared one tab at a time."""
    return StreamingResponse(
        io.BytesIO(build_song_sheet_template()),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="harvest-song-sheet-template.xlsx"'},
    )


@router.get("/import/template")
async def download_flat_import_template():
    """Flat title/artist/lyrics CSV template -- the counterpart to the
    tab-per-song template above, for bulk-importing many songs at once."""
    return StreamingResponse(
        io.BytesIO(build_flat_import_template()),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="harvest-song-import-template.csv"'},
    )


@router.post("", response_model=SongOut)
async def create_song(payload: SongCreate, db: AsyncSession = Depends(get_db)):
    lines = [line.model_dump() for line in payload.lines]
    song = await save_song(db, payload.title, lines, artist=payload.artist)
    # Quick-add is a rare, one-song-at-a-time fallback (PDD §10.4) -- embedding
    # immediately here is fine; the bulk import path below batches instead.
    await asyncio.get_running_loop().run_in_executor(None, embed_and_store_song_lines)
    return song


@router.post("/import/preview", response_model=SongImportPreview)
async def preview_song_import(file: UploadFile):
    """Parses a bulk-import file (.csv, or .xlsx in either the flat or
    tab-per-song format -- see parse_song_import) without saving anything.
    The operator reviews the result and calls /import/commit with whichever
    rows they want kept, so a bad row never becomes a bad database write.
    """
    contents = await file.read()
    parsed = await asyncio.get_running_loop().run_in_executor(
        None, parse_song_import, io.BytesIO(contents), file.filename or ""
    )
    return SongImportPreview(
        ready=[
            SongImportRow(title=song.title, artist=song.artist, lines=song.lines) for song in parsed.songs
        ],
        errors=[SheetErrorOut(tab=e.tab, problem=e.problem) for e in parsed.errors],
    )


@router.post("/import/commit", response_model=SongImportCommitResult)
async def commit_song_import(payload: SongImportCommitRequest, db: AsyncSession = Depends(get_db)):
    """Saves exactly the rows the operator confirmed from a prior
    /import/preview call (possibly hand-edited first), then runs one
    batched embedding pass for the whole import -- not saved until this
    step, matching Phase 07's "one batch embedding call per import" choice.
    """
    imported = [
        await save_song(db, song.title, [line.model_dump() for line in song.lines], artist=song.artist)
        for song in payload.songs
    ]

    if imported:
        await asyncio.get_running_loop().run_in_executor(None, embed_and_store_song_lines)

    return SongImportCommitResult(imported=[SongSummary.model_validate(song) for song in imported])


@router.get("", response_model=list[SongSummary])
async def list_songs(q: str = Query(..., min_length=1), db: AsyncSession = Depends(get_db)):
    return await search_songs(db, q)


@router.get("/{song_id}", response_model=SongOut)
async def read_song(song_id: int, db: AsyncSession = Depends(get_db)):
    song = await get_song(db, song_id)
    if song is None:
        raise HTTPException(status_code=404, detail="Song not found")
    return song
