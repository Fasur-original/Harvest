from pydantic import BaseModel, ConfigDict

from app.schemas.song import SongSummary


class ServiceSetStart(BaseModel):
    song_ids: list[int]
    default_translation: str | None = None


class ServiceSetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    songs: list[SongSummary]
    default_translation: str | None = None
