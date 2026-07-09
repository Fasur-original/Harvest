from pydantic import BaseModel, ConfigDict


class SongLineIn(BaseModel):
    line_number: int
    line_text: str
    repeat_count: int = 1


class SongLineOut(SongLineIn):
    model_config = ConfigDict(from_attributes=True)


class SongCreate(BaseModel):
    title: str
    artist: str | None = None
    lines: list[SongLineIn]


class SongSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    artist: str | None = None


class SongOut(SongSummary):
    lines: list[SongLineOut]


class SheetErrorOut(BaseModel):
    tab: str
    problem: str


class SongImportRow(BaseModel):
    """One song parsed out of a bulk-import file, not yet saved -- the
    operator reviews/fixes these before anything reaches the database (see
    POST /songs/import/preview + /songs/import/commit)."""

    title: str
    artist: str | None = None
    lines: list[SongLineIn]


class SongImportPreview(BaseModel):
    ready: list[SongImportRow]
    errors: list[SheetErrorOut]


class SongImportCommitRequest(BaseModel):
    songs: list[SongImportRow]


class SongImportCommitResult(BaseModel):
    imported: list[SongSummary]
