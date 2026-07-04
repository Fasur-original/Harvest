"""Loads data/bible/*.json into the verses table. Run after prepare_bible_data.py.

Usage: python scripts/load_bible_data.py
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # backend/ -> importable as `app.*`

from app.data.verses import load_all_translations  # noqa: E402
from app.database import AsyncSessionLocal, engine  # noqa: E402
from app.models import Base  # noqa: E402

TRANSLATIONS = ["KJV", "ASV", "YLT", "WEB"]


async def main() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        counts = await load_all_translations(db, TRANSLATIONS)

    for translation, count in counts.items():
        print(f"{translation}: {count} rows written")


if __name__ == "__main__":
    asyncio.run(main())
