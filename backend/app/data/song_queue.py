"""Named data-layer functions for the song queue -- an operator-curated
worklist of songs for the service, separate from the reading queue (which is
built from a spoken multi-reference announcement, not by hand).
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import SongQueue, SongQueueEntry


async def get_active_song_queue(db: AsyncSession) -> SongQueue | None:
    result = await db.execute(
        select(SongQueue)
        .where(SongQueue.cleared_at.is_(None))
        .options(selectinload(SongQueue.entries).selectinload(SongQueueEntry.song))
    )
    return result.scalar_one_or_none()


async def add_to_song_queue(db: AsyncSession, song_id: int) -> SongQueue:
    """Appends a song to the active queue, creating one if none is active."""
    queue = await get_active_song_queue(db)
    if queue is None:
        # A freshly constructed object's `entries` is trivially empty (it
        # can't have committed children yet) -- position=0 directly, rather
        # than reading `queue.entries` here, which would trigger a lazy-load
        # SQLAlchemy's async session can't service outside an awaited call
        # (MissingGreenlet).
        queue = SongQueue()
        db.add(queue)
        await db.flush()
        position = 0
    else:
        position = len(queue.entries)

    db.add(SongQueueEntry(song_queue_id=queue.id, position=position, song_id=song_id))
    await db.commit()
    # Re-fetch through the same eager-loaded path `get_active_song_queue`
    # uses, rather than `db.refresh(queue, attribute_names=["entries"])` --
    # that reloads the entries collection but not each entry's nested `song`
    # relationship, and `SongQueueEntry.title` needs `.song.title` (see
    # app/models/song_queue.py). A refresh that leaves `.song` unloaded would
    # crash the next access with SQLAlchemy's async MissingGreenlet error.
    return await get_active_song_queue(db)  # type: ignore[return-value]


async def remove_song_queue_entry(db: AsyncSession, entry_id: int) -> None:
    entry = await db.get(SongQueueEntry, entry_id)
    if entry is None:
        return
    queue = await db.get(SongQueue, entry.song_queue_id)
    await db.delete(entry)
    if queue is not None and queue.current_entry_id == entry_id:
        queue.current_entry_id = None
        queue.current_line_number = None
    await db.commit()


async def clear_song_queue(db: AsyncSession) -> None:
    active = await get_active_song_queue(db)
    if active is not None:
        active.cleared_at = datetime.now(timezone.utc)
        await db.commit()


async def sync_song_queue_to_reference(db: AsyncSession, song_id: int, line_number: int) -> SongQueue | None:
    """Moves the active song queue's "now playing" pointer to whichever
    entry is this song, and updates the line position within it -- the song
    equivalent of `reading_queue.sync_current_to_reference`. Called
    identically whether the song/line came from live speech detection or the
    operator confirming manually (including clicking a queue entry directly).

    Unlike the reading queue, a song not already in the queue is *not* added
    automatically -- confirming/displaying a song that was never queued still
    works via the normal confirm path, it just doesn't show up in this
    worklist unless the operator explicitly added it.

    Returns the updated queue only when something actually changed, so
    callers can broadcast exactly when there's something new to show.
    """
    queue = await get_active_song_queue(db)
    if queue is None:
        return None

    entry = next((e for e in queue.entries if e.song_id == song_id), None)
    if entry is None:
        return None
    if queue.current_entry_id == entry.id and queue.current_line_number == line_number:
        return None

    queue.current_entry_id = entry.id
    queue.current_line_number = line_number
    await db.commit()
    return await get_active_song_queue(db)
