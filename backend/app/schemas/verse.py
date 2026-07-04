from pydantic import BaseModel, ConfigDict


class VerseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    book: str
    chapter: int
    verse: int
    translation: str
    text: str
