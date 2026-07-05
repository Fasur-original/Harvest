"""Raw sqlite3 + sqlite-vec connection management for the embedding index.

Embeddings live in sqlite-vec virtual tables in the same database file as the
rest of the app's data (PDD §4: "SQLite + sqlite-vec"), but vec0 virtual
tables aren't something SQLAlchemy's ORM models -- this is a deliberately
separate, narrow connection dedicated to vector storage/search only. The
regular relational data (verses, songs) stays owned by the SQLAlchemy layer;
this module just needs to agree with it on row ids and the database file path.
"""

from __future__ import annotations

import sqlite3
import struct

import sqlite_vec

from app.config import settings


def _db_path() -> str:
    url = settings.DATABASE_URL
    if not url.startswith("sqlite:///"):
        raise RuntimeError("Embedding search currently requires a local SQLite DATABASE_URL")
    return url.removeprefix("sqlite:///")


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(_db_path())
    conn.enable_load_extension(True)
    sqlite_vec.load(conn)
    conn.enable_load_extension(False)
    return conn


def ensure_tables(conn: sqlite3.Connection, dimension: int) -> None:
    conn.execute(
        f"CREATE VIRTUAL TABLE IF NOT EXISTS verse_vectors USING vec0("
        f"embedding float[{dimension}] distance_metric=cosine)"
    )
    conn.execute(
        f"CREATE VIRTUAL TABLE IF NOT EXISTS song_line_vectors USING vec0("
        f"embedding float[{dimension}] distance_metric=cosine)"
    )
    conn.commit()


def to_blob(vector: list[float]) -> bytes:
    return struct.pack(f"{len(vector)}f", *vector)
