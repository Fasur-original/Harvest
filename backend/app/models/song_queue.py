from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.models.base import Base
from app.models.song import Song


class SongQueueEntry(Base):
    """One song in an operator-built song queue -- a manual worklist for the
    service, separate from the reading queue (which is built from a spoken
    multi-reference announcement, not curated by hand).
    """

    __tablename__ = "song_queue_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    song_queue_id: Mapped[int] = mapped_column(ForeignKey("song_queues.id"))
    position: Mapped[int]
    song_id: Mapped[int] = mapped_column(ForeignKey("songs.id"))

    song: Mapped[Song] = relationship()

    @property
    def title(self) -> str:
        # Not a mapped column -- lets SongQueueEntryOut's from_attributes
        # validation read a flat `title` straight off the ORM object instead
        # of every caller needing to know to reach through `.song.title`.
        return self.song.title


class SongQueue(Base):
    """Scoped to the current service the same way `ServiceSet` and
    `ReadingQueue` are -- one active queue at a time.
    """

    __tablename__ = "song_queues"

    id: Mapped[int] = mapped_column(primary_key=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    cleared_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Which entry (i.e. which song) is "now playing" -- not auto-selected on
    # add, unlike ReadingQueue's first entry, since a song queue is built up
    # piece by piece rather than derived from one spoken announcement that
    # implies a reading order.
    current_entry_id: Mapped[int | None] = mapped_column(ForeignKey("song_queue_entries.id"), nullable=True)
    # Which line of the current entry's song is showing -- a song queue entry
    # is one song, but the operator steps through that song's own lines one
    # at a time, same as a live line-by-line embedding match would.
    current_line_number: Mapped[int | None] = mapped_column(nullable=True)

    entries: Mapped[list[SongQueueEntry]] = relationship(
        foreign_keys=[SongQueueEntry.song_queue_id],
        order_by=SongQueueEntry.position,
        cascade="all, delete-orphan",
    )
