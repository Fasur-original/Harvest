"""Named data-layer functions for the reading queue (PDD §5.6, §6.6)."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.data.verses import get_verse
from app.models import ReadingQueue, ReadingQueueEntry


async def create_reading_queue(db: AsyncSession, references: list[tuple[str, int, int]]) -> ReadingQueue:
    """Replaces any active queue with a freshly-announced sequence.

    Always starts fresh rather than appending to a queue already in progress
    (PDD §16 open question) -- the simpler default, and appending silently
    behind the operator's back risks a queue that no longer matches what's
    printed/expected on screen without a positive signal that's actually
    what's wanted.
    """
    await clear_reading_queue(db)

    queue = ReadingQueue(
        entries=[
            ReadingQueueEntry(position=i, book=book, chapter=chapter, verse=verse)
            for i, (book, chapter, verse) in enumerate(references)
        ]
    )
    db.add(queue)
    await db.commit()
    await db.refresh(queue, attribute_names=["entries"])

    # The first-named entry starts as "now reading" until actual speech (or
    # the operator jumping directly) says otherwise -- see
    # `sync_current_to_reference` below for how that happens.
    queue.current_entry_id = queue.entries[0].id
    await db.commit()
    await db.refresh(queue, attribute_names=["entries"])
    return queue


async def get_active_queue(db: AsyncSession) -> ReadingQueue | None:
    result = await db.execute(
        select(ReadingQueue).where(ReadingQueue.cleared_at.is_(None)).options(selectinload(ReadingQueue.entries))
    )
    return result.scalar_one_or_none()


async def clear_reading_queue(db: AsyncSession) -> None:
    active = await get_active_queue(db)
    if active is not None:
        active.cleared_at = datetime.now(timezone.utc)
        await db.commit()


async def sync_current_to_reference(db: AsyncSession, book: str, chapter: int, verse: int) -> ReadingQueue | None:
    """Moves the active queue's "now reading" pointer to whichever entry
    matches this reference, if any -- the mechanism behind "the system
    rearranges the queue based on what the preacher actually calls or wants
    to read," not just the order it was originally announced in.

    Called identically whether the reference came from live speech detection
    (`app/routes/transcript.py`) or the operator confirming a verse manually,
    including by clicking an entry directly in the queue UI
    (`app/main.py`'s `/ws` confirm handler) -- one function, not two
    near-duplicate "sync from speech" / "sync from a click" versions.

    Returns the updated queue only when something actually changed (a real
    entry was found and it wasn't already current), so callers can broadcast
    exactly when there's something new to show and skip it otherwise.
    """
    queue = await get_active_queue(db)
    if queue is None:
        return None

    entry = next((e for e in queue.entries if (e.book, e.chapter, e.verse) == (book, chapter, verse)), None)
    if entry is None or queue.current_entry_id == entry.id:
        return None

    queue.current_entry_id = entry.id
    await db.commit()
    await db.refresh(queue, attribute_names=["entries"])
    return queue


async def update_reading_queue_entry(
    db: AsyncSession, entry_id: int, book: str, chapter: int, verse: int
) -> tuple[ReadingQueueEntry, bool] | None:
    """Corrects a queue entry's reference in place (a preacher's spoken
    reference gets mis-transcribed sometimes -- "John 3:16" heard as "John
    13:16" -- and the fix shouldn't require discarding the whole queue entry
    and starting over).

    Validates the corrected reference resolves to a real verse first (same
    existence check a fresh sequence announcement gets) -- an edit that
    doesn't exist is worse than no edit at all. Returns `(entry, is_current)`
    so the caller (the route) knows whether to also push a corrected display
    update, or `None` if the entry doesn't exist or the correction doesn't
    resolve to a real verse.
    """
    entry = await db.get(ReadingQueueEntry, entry_id)
    if entry is None:
        return None

    if await get_verse(db, book, chapter, verse, settings.MATCH_DEFAULT_TRANSLATION) is None:
        return None

    entry.book, entry.chapter, entry.verse = book, chapter, verse
    await db.commit()
    await db.refresh(entry)

    queue = await db.get(ReadingQueue, entry.reading_queue_id)
    is_current = queue is not None and queue.current_entry_id == entry.id
    return entry, is_current
