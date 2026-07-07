from pydantic import BaseModel, ConfigDict


class SongQueueAdd(BaseModel):
    song_id: int


class SongQueueEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    position: int
    song_id: int
    title: str


class SongQueueOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    entries: list[SongQueueEntryOut]
    current_entry_id: int | None
    current_line_number: int | None
