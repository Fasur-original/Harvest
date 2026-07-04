from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.data.verses import get_verse
from app.database import get_db
from app.schemas.verse import VerseOut

router = APIRouter(prefix="/bible", tags=["bible"])


@router.get("/verse", response_model=VerseOut)
async def read_verse(
    book: str,
    chapter: int,
    verse: int,
    translation: str = "KJV",
    db: AsyncSession = Depends(get_db),
):
    result = await get_verse(db, book, chapter, verse, translation.upper())
    if result is None:
        raise HTTPException(status_code=404, detail="Verse not found")
    return result
