from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.models.base import Base


class Song(Base):
    __tablename__ = "songs"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    lines: Mapped[list["SongLine"]] = relationship(
        back_populates="song", cascade="all, delete-orphan", order_by="SongLine.line_number"
    )


class SongLine(Base):
    __tablename__ = "song_lines"

    id: Mapped[int] = mapped_column(primary_key=True)
    song_id: Mapped[int] = mapped_column(ForeignKey("songs.id"))
    line_number: Mapped[int]
    line_text: Mapped[str] = mapped_column(Text)
    repeat_count: Mapped[int] = mapped_column(default=1)

    song: Mapped["Song"] = relationship(back_populates="lines")
