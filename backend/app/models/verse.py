from sqlalchemy import String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Verse(Base):
    __tablename__ = "verses"
    __table_args__ = (
        UniqueConstraint("book", "chapter", "verse", "translation", name="uq_verse_reference"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    book: Mapped[str] = mapped_column(String(32), index=True)
    chapter: Mapped[int]
    verse: Mapped[int]
    translation: Mapped[str] = mapped_column(String(8), index=True)
    text: Mapped[str] = mapped_column(Text)
