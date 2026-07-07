from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.data.reading_queue import clear_reading_queue, get_active_queue, update_reading_queue_entry
from app.data.verses import get_verse
from app.database import get_db
from app.matching import display_state
from app.schemas.reading_queue import ReadingQueueEntryEdit, ReadingQueueOut
from app.ws import manager

router = APIRouter(prefix="/reading-queue", tags=["reading-queue"])


@router.get("/active", response_model=ReadingQueueOut)
async def active_queue(db: AsyncSession = Depends(get_db)):
    queue = await get_active_queue(db)
    if queue is None:
        raise HTTPException(status_code=404, detail="No active reading queue")
    return queue


@router.patch("/entries/{entry_id}", response_model=ReadingQueueOut)
async def edit_entry(entry_id: int, payload: ReadingQueueEntryEdit, db: AsyncSession = Depends(get_db)):
    result = await update_reading_queue_entry(db, entry_id, payload.book, payload.chapter, payload.verse)
    if result is None:
        raise HTTPException(status_code=404, detail="Queue entry not found, or the corrected reference doesn't exist")
    entry, is_current = result

    if is_current:
        # This entry is the one currently on the projector -- a corrected
        # reference needs to correct what's actually being shown too, not
        # just the queue list underneath it.
        verse = await get_verse(db, entry.book, entry.chapter, entry.verse, settings.MATCH_DEFAULT_TRANSLATION)
        if verse is not None:
            confirm_message = {
                "action": "confirm",
                "kind": "verse",
                "book": verse.book,
                "chapter": verse.chapter,
                "verse": verse.verse,
                "translation": verse.translation,
                "text": verse.text,
            }
            display_state.record_confirmed(confirm_message)
            await manager.send_to_all(confirm_message)

    queue = await get_active_queue(db)
    if queue is not None:
        await manager.send_to_all({"type": "reading_queue", **ReadingQueueOut.model_validate(queue).model_dump()})
    return queue


@router.post("/clear", status_code=204)
async def clear_queue(db: AsyncSession = Depends(get_db)):
    await clear_reading_queue(db)
