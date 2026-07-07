from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.models.base import Base


class ReadingQueueEntry(Base):
    """One reference in a preacher-announced sequence (PDD §5.6)."""

    __tablename__ = "reading_queue_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    reading_queue_id: Mapped[int] = mapped_column(ForeignKey("reading_queues.id"))
    # Order as originally announced -- display order, not a requirement that
    # the preacher actually reads them in this order (PDD §6.6).
    position: Mapped[int]
    book: Mapped[str] = mapped_column(String(32))
    chapter: Mapped[int]
    verse: Mapped[int]


class ReadingQueue(Base):
    """A sequence of references named at once (PDD §5.6, §6.6), scoped to
    the current service the same way `ServiceSet` is -- one active queue at
    a time, cleared rather than deleted when superseded or the service ends.
    """

    __tablename__ = "reading_queues"

    id: Mapped[int] = mapped_column(primary_key=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    cleared_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Which entry is "now reading" -- not necessarily the next one by
    # `position`, since the preacher (or the operator, jumping directly) may
    # read the queue out of the order it was originally announced in.
    current_entry_id: Mapped[int | None] = mapped_column(
        ForeignKey("reading_queue_entries.id"), nullable=True
    )

    entries: Mapped[list[ReadingQueueEntry]] = relationship(
        foreign_keys=[ReadingQueueEntry.reading_queue_id],
        order_by=ReadingQueueEntry.position,
        cascade="all, delete-orphan",
    )
    current_entry: Mapped[ReadingQueueEntry | None] = relationship(foreign_keys=[current_entry_id], viewonly=True)
