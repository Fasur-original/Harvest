from pydantic import BaseModel, ConfigDict

from app.schemas.song import SongSummary


class ServiceSetStart(BaseModel):
    song_ids: list[int]


class ServiceSetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    songs: list[SongSummary]
