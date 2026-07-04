"""Named data-layer functions for Bible verses (PDD §6.1).

This is the only module that touches the `verses` table -- routes, workers, and
scripts go through these functions rather than querying the ORM directly (PDD §6).
"""

from __future__ import annotations

import json
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Verse

DATA_DIR = Path(__file__).resolve().parents[3] / "data" / "bible"


async def load_translation(db: AsyncSession, translation: str) -> int:
    """Idempotently upserts data/bible/<translation>.json into the verses table.

    Returns the number of rows inserted or changed; re-running with unchanged
    source data returns 0.
    """
    path = DATA_DIR / f"{translation.lower()}.json"
    rows = json.loads(path.read_text(encoding="utf-8"))

    result = await db.execute(select(Verse).where(Verse.translation == translation))
    existing = {(v.book, v.chapter, v.verse): v for v in result.scalars()}

    written = 0
    for row in rows:
        key = (row["book"], row["chapter"], row["verse"])
        verse = existing.get(key)
        if verse is None:
            db.add(
                Verse(
                    book=row["book"],
                    chapter=row["chapter"],
                    verse=row["verse"],
                    translation=translation,
                    text=row["text"],
                )
            )
            written += 1
        elif verse.text != row["text"]:
            verse.text = row["text"]
            written += 1

    await db.commit()
    return written


async def load_all_translations(db: AsyncSession, translations: list[str]) -> dict[str, int]:
    return {translation: await load_translation(db, translation) for translation in translations}
