from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, String, Table
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.models.base import Base
from app.models.song import Song

service_set_songs = Table(
    "service_set_songs",
    Base.metadata,
    Column("service_set_id", ForeignKey("service_sets.id"), primary_key=True),
    Column("song_id", ForeignKey("songs.id"), primary_key=True),
)


class ServiceSet(Base):
    """Today's active song set (PDD §6.2) -- checked first during matching (Phase 05+)."""

    __tablename__ = "service_sets"

    id: Mapped[int] = mapped_column(primary_key=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    cleared_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Which translation an unnamed reference should resolve to for today's
    # service (PDD §8) -- null means "use the install-wide default" instead
    # of duplicating that value onto every service set that doesn't override it.
    default_translation: Mapped[str | None] = mapped_column(String(8), nullable=True)

    songs: Mapped[list[Song]] = relationship(secondary=service_set_songs)
