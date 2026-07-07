from pydantic import BaseModel, ConfigDict


class ReadingQueueEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    position: int
    book: str
    chapter: int
    verse: int


class ReadingQueueOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    entries: list[ReadingQueueEntryOut]
    current_entry_id: int | None
