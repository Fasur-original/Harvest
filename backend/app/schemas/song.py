from pydantic import BaseModel, ConfigDict


class SongLineIn(BaseModel):
    line_number: int
    line_text: str
    repeat_count: int = 1


class SongLineOut(SongLineIn):
    model_config = ConfigDict(from_attributes=True)


class SongCreate(BaseModel):
    title: str
    lines: list[SongLineIn]


class SongSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str


class SongOut(SongSummary):
    lines: list[SongLineOut]
