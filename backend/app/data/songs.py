"""Named data-layer functions for songs (PDD §6.1).

`parse_song_sheet` (workbook upload) is Phase 07's job -- for now, songs are
created directly via `save_song` with manually-entered lines.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Song, SongLine


async def save_song(db: AsyncSession, title: str, lines: list[dict]) -> Song:
    song = Song(
        title=title,
        lines=[
            SongLine(
                line_number=line["line_number"],
                line_text=line["line_text"],
                repeat_count=line.get("repeat_count", 1),
            )
            for line in lines
        ],
    )
    db.add(song)
    await db.commit()
    await db.refresh(song, attribute_names=["lines"])
    return song


async def get_song(db: AsyncSession, song_id: int) -> Song | None:
    result = await db.execute(
        select(Song).where(Song.id == song_id).options(selectinload(Song.lines))
    )
    return result.scalar_one_or_none()


async def search_songs(db: AsyncSession, query: str) -> list[Song]:
    result = await db.execute(select(Song).where(Song.title.ilike(f"%{query}%")))
    return list(result.scalars())
