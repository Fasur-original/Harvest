"""Named data-layer functions for service state (PDD §6.2) -- today's active song set."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import ServiceSet, Song


async def start_service_set(db: AsyncSession, song_ids: list[int]) -> ServiceSet:
    """Marks today's active song set, replacing any set already active."""
    await clear_service_set(db)

    result = await db.execute(select(Song).where(Song.id.in_(song_ids)))
    service_set = ServiceSet(songs=list(result.scalars()))
    db.add(service_set)
    await db.commit()
    await db.refresh(service_set, attribute_names=["songs"])
    return service_set


async def get_active_set(db: AsyncSession) -> ServiceSet | None:
    result = await db.execute(
        select(ServiceSet)
        .where(ServiceSet.cleared_at.is_(None))
        .options(selectinload(ServiceSet.songs))
    )
    return result.scalar_one_or_none()


async def clear_service_set(db: AsyncSession) -> None:
    active = await get_active_set(db)
    if active is not None:
        active.cleared_at = datetime.now(timezone.utc)
        await db.commit()
