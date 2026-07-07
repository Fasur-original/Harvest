"""Named data-layer functions for songs (PDD §6.1)."""

from __future__ import annotations

import io
from dataclasses import dataclass
from typing import BinaryIO

import openpyxl
from openpyxl.styles import Font
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Song, SongLine


@dataclass
class ParsedSong:
    title: str
    lines: list[dict]  # [{"line_number": int, "line_text": str, "repeat_count": int}, ...]


@dataclass
class SheetError:
    tab: str
    problem: str


@dataclass
class ParsedSongSheet:
    songs: list[ParsedSong]
    errors: list[SheetError]


def parse_song_sheet(file: BinaryIO) -> ParsedSongSheet:
    """Reads one workbook, one tab per song, tab name = title (PDD §10.2).

    Each tab needs a header row naming its columns. Only "line_text" is
    required; "repeat_count" is optional and defaults to 1 when blank, since
    most lines don't repeat and typing "1" on every single row is exactly
    the kind of tedium worth designing out. There's no "line_number" column
    at all -- line order comes from row order, one less thing for whoever
    fills the sheet in to get wrong or keep in sync if rows get reordered
    later.

    Best-effort (PDD §10.3): a malformed tab is recorded as an error naming
    that exact tab and problem, and skipped -- it doesn't fail every other
    tab in the same workbook.
    """
    workbook = openpyxl.load_workbook(file, data_only=True, read_only=True)

    songs: list[ParsedSong] = []
    errors: list[SheetError] = []
    seen_titles: set[str] = set()

    for sheet in workbook.worksheets:
        title = sheet.title.strip()

        if title in seen_titles:
            errors.append(SheetError(tab=title, problem=f'duplicate tab name "{title}" -- each song needs a unique tab'))
            continue
        seen_titles.add(title)

        rows = list(sheet.iter_rows(values_only=True))
        if not rows or all(cell is None for cell in rows[0]):
            errors.append(SheetError(tab=title, problem="empty sheet, no header row"))
            continue

        header = [str(cell).strip().lower() if cell is not None else "" for cell in rows[0]]
        if "line_text" not in header:
            errors.append(SheetError(tab=title, problem='missing required "line_text" column in the header row'))
            continue

        text_col = header.index("line_text")
        repeat_col = header.index("repeat_count") if "repeat_count" in header else None

        lines: list[dict] = []
        row_problem: str | None = None
        for row_index, row in enumerate(rows[1:], start=2):
            text = row[text_col] if text_col < len(row) else None
            if text is None or str(text).strip() == "":
                continue  # skip blank rows silently -- common spreadsheet padding

            repeat_count = 1
            if repeat_col is not None and repeat_col < len(row) and row[repeat_col] is not None:
                raw = row[repeat_col]
                try:
                    repeat_count = int(raw)
                    if repeat_count < 1:
                        raise ValueError
                except (TypeError, ValueError):
                    row_problem = f'row {row_index}: "repeat_count" must be a positive whole number, got {raw!r}'
                    break

            lines.append(
                {"line_number": len(lines) + 1, "line_text": str(text).strip(), "repeat_count": repeat_count}
            )

        if row_problem is not None:
            errors.append(SheetError(tab=title, problem=row_problem))
            continue

        if not lines:
            errors.append(SheetError(tab=title, problem="no lyric lines found under the header row"))
            continue

        songs.append(ParsedSong(title=title, lines=lines))

    return ParsedSongSheet(songs=songs, errors=errors)


def build_song_sheet_template() -> bytes:
    """A ready-to-duplicate example workbook (PDD §10.3).

    Whoever preps the sheet copies this tab for each new song and renames it
    (Excel: right-click -> Move or Copy -> Create a copy) rather than
    building the column layout from scratch every time. Shows both an
    ordinary line and a repeated one, so the `repeat_count` column's meaning
    is obvious from the example rather than needing separate instructions.
    """
    workbook = openpyxl.Workbook()
    sheet = workbook.active
    sheet.title = "Example Song (copy this tab)"

    sheet.append(["line_text", "repeat_count"])
    for cell in sheet[1]:
        cell.font = Font(bold=True)

    sheet.append(["Amazing grace, how sweet the sound", None])
    sheet.append(["That saved a wretch like me", None])
    sheet.append(["I once was lost, but now am found", 3])
    sheet.append(["Was blind, but now I see", None])

    sheet.column_dimensions["A"].width = 42
    sheet.column_dimensions["B"].width = 14

    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


async def save_song(db: AsyncSession, title: str, lines: list[dict]) -> Song:
    """Creates a song, or replaces an existing one with the same title.

    Re-uploading a song already in the permanent library (PDD §10.5 -- a
    repeat song shouldn't need a tab prepared again, but nothing stops
    someone from including it anyway) updates its lines in place instead of
    creating a duplicate entry that would clutter search results.
    """
    existing = (
        await db.execute(select(Song).where(Song.title == title).options(selectinload(Song.lines)))
    ).scalar_one_or_none()

    new_lines = [
        SongLine(
            line_number=line["line_number"],
            line_text=line["line_text"],
            repeat_count=line.get("repeat_count", 1),
        )
        for line in lines
    ]

    if existing is not None:
        existing.lines = new_lines  # cascade="all, delete-orphan" replaces the old rows
        song = existing
    else:
        song = Song(title=title, lines=new_lines)
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
