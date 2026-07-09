"""Embedding-based matching (PDD §6.1: search_by_embedding).

The only function in the app performing RAG -- everything else is a plain
lookup/write (PDD §6). Verses and songs both resolve through this same
function, parameterized by `scope`, rather than two near-duplicate
implementations (PDD §10.1: "matched the same way").

Bulk-embedding (`embed_and_store_verses`/`embed_and_store_song_lines`) and
querying (`search_by_embedding`) are both synchronous and CPU-bound --
callers in async code should run them via `run_in_executor`, same pattern as
Phase 04's STTWorker.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from sentence_transformers import SentenceTransformer

from app.config import settings
from app.matching.vector_store import ensure_tables, from_blob, get_connection, to_blob

Scope = Literal["verses", "songs"]

_model: SentenceTransformer | None = None


def _ensure_model() -> SentenceTransformer:
    global _model
    if _model is None:
        try:
            # Once cached (scripts/embed_content.py's first run needs network
            # to download it), loading should never depend on reaching the
            # network again -- the app has to work fully offline (PDD §2), and
            # a transient network blip shouldn't be able to break matching
            # when a perfectly good local copy already exists.
            _model = SentenceTransformer(
                settings.EMBEDDING_MODEL, device=settings.EMBEDDING_DEVICE, local_files_only=True
            )
        except OSError:
            _model = SentenceTransformer(settings.EMBEDDING_MODEL, device=settings.EMBEDDING_DEVICE)
    return _model


@dataclass
class MatchCandidate:
    kind: Scope
    score: float  # cosine similarity, 1.0 = identical wording direction
    text: str
    book: str | None = None
    chapter: int | None = None
    verse: int | None = None
    translation: str | None = None
    song_id: int | None = None
    line_number: int | None = None


@dataclass
class TranslationRanking:
    translation: str
    text: str
    similarity: float  # cosine similarity to the spoken sentence, 1.0 = closest possible


def embed_and_store_verses(batch_size: int = 64) -> int:
    """Idempotent: only embeds verses not already present in verse_vectors.

    Returns the number of verses newly embedded.
    """
    model = _ensure_model()
    conn = get_connection()
    try:
        ensure_tables(conn, model.get_sentence_embedding_dimension())

        already = {row[0] for row in conn.execute("SELECT rowid FROM verse_vectors")}
        rows = conn.execute("SELECT id, text FROM verses").fetchall()
        todo = [(vid, text) for vid, text in rows if vid not in already]

        for i in range(0, len(todo), batch_size):
            batch = todo[i : i + batch_size]
            vectors = model.encode(
                [text for _, text in batch], normalize_embeddings=True, batch_size=batch_size
            )
            conn.executemany(
                "INSERT INTO verse_vectors(rowid, embedding) VALUES (?, ?)",
                [(vid, to_blob(vector.tolist())) for (vid, _), vector in zip(batch, vectors)],
            )
            conn.commit()

        return len(todo)
    finally:
        conn.close()


def embed_and_store_song_lines(batch_size: int = 64) -> int:
    """Idempotent: only embeds song lines not already present in song_line_vectors."""
    model = _ensure_model()
    conn = get_connection()
    try:
        ensure_tables(conn, model.get_sentence_embedding_dimension())

        already = {row[0] for row in conn.execute("SELECT rowid FROM song_line_vectors")}
        rows = conn.execute("SELECT id, line_text FROM song_lines").fetchall()
        todo = [(lid, text) for lid, text in rows if lid not in already]

        for i in range(0, len(todo), batch_size):
            batch = todo[i : i + batch_size]
            vectors = model.encode(
                [text for _, text in batch], normalize_embeddings=True, batch_size=batch_size
            )
            conn.executemany(
                "INSERT INTO song_line_vectors(rowid, embedding) VALUES (?, ?)",
                [(lid, to_blob(vector.tolist())) for (lid, _), vector in zip(batch, vectors)],
            )
            conn.commit()

        return len(todo)
    finally:
        conn.close()


def embed_query(text: str) -> bytes:
    """Embeds text for search (not storage) into a ready-to-query sqlite-vec blob.

    Split out from `search_by_embedding` so a caller checking multiple scopes
    for the same text (verses and songs, e.g.) embeds it once and reuses the
    result via `search_by_vector`, rather than re-running the embedding model
    on identical input once per scope -- embedding, not the vec0 lookup
    itself, is the expensive part of a search.
    """
    model = _ensure_model()
    return to_blob(model.encode([text], normalize_embeddings=True)[0].tolist())


def search_by_vector(
    query_vector: bytes, scope: Scope, top_k: int = 5, song_ids: list[int] | None = None
) -> list[MatchCandidate]:
    """Same as `search_by_embedding`, but takes an already-embedded query.

    `song_ids` restricts the "songs" scope to a specific set of songs (PDD
    §10.5: check today's uploaded set before the full permanent library).
    Ignored for "verses" -- there's no equivalent per-service scoping for
    verses, which are shared across every install. Filtered in Python after
    an over-fetched KNN pass rather than pushed into the vec0 query itself,
    so this doesn't depend on whatever filtering syntax a given sqlite-vec
    version does or doesn't support.
    """
    model = _ensure_model()
    conn = get_connection()
    try:
        ensure_tables(conn, model.get_sentence_embedding_dimension())
        candidates: list[MatchCandidate] = []

        if scope == "verses":
            rows = conn.execute(
                "SELECT rowid, distance FROM verse_vectors WHERE embedding MATCH ? AND k = ? ORDER BY distance",
                (query_vector, top_k),
            ).fetchall()
            for rowid, distance in rows:
                verse_row = conn.execute(
                    "SELECT book, chapter, verse, translation, text FROM verses WHERE id = ?", (rowid,)
                ).fetchone()
                if verse_row is None:
                    continue
                book, chapter, verse_num, translation, verse_text = verse_row
                candidates.append(
                    MatchCandidate(
                        kind="verses",
                        score=1 - distance,
                        text=verse_text,
                        book=book,
                        chapter=chapter,
                        verse=verse_num,
                        translation=translation,
                    )
                )
        else:
            allowed = set(song_ids) if song_ids is not None else None
            fetch_k = top_k if allowed is None else max(top_k * 10, 50)
            rows = conn.execute(
                "SELECT rowid, distance FROM song_line_vectors WHERE embedding MATCH ? AND k = ? ORDER BY distance",
                (query_vector, fetch_k),
            ).fetchall()
            for rowid, distance in rows:
                line_row = conn.execute(
                    "SELECT song_id, line_number, line_text FROM song_lines WHERE id = ?", (rowid,)
                ).fetchone()
                if line_row is None:
                    continue
                song_id, line_number, line_text = line_row
                if allowed is not None and song_id not in allowed:
                    continue
                candidates.append(
                    MatchCandidate(
                        kind="songs",
                        score=1 - distance,
                        text=line_text,
                        song_id=song_id,
                        line_number=line_number,
                    )
                )
                if len(candidates) >= top_k:
                    break

        return candidates
    finally:
        conn.close()


def search_by_embedding(
    text: str, scope: Scope, top_k: int = 5, song_ids: list[int] | None = None
) -> list[MatchCandidate]:
    """Returns the closest matches above sqlite-vec's own floor, ranked by score.

    An empty result means the index for that scope has nothing in it yet
    (e.g. no songs uploaded) -- not an error. Convenience wrapper for a
    single-scope search; see `embed_query`/`search_by_vector` if searching
    more than one scope for the same text.
    """
    return search_by_vector(embed_query(text), scope, top_k, song_ids=song_ids)


def rank_translations_by_similarity(book: str, chapter: int, verse: int, spoken_text: str) -> list[TranslationRanking]:
    """"Closest match to what was said" -- for every translation loaded for
    this exact verse, ranks it by cosine similarity between the preacher's
    spoken sentence and that translation's own wording for this verse.

    A relevance ranking against what was just said, not a scholarly or
    theological judgment about translation accuracy -- callers must not
    present it as the latter.

    Compares against each translation's already-STORED embedding (computed
    once during the one-time bulk embedding pass -- embed_and_store_verses)
    rather than re-embedding four short verse texts on every request; only
    the spoken sentence itself is embedded fresh here. Embeddings are
    already L2-normalized (normalize_embeddings=True throughout this
    module), so cosine similarity is just the dot product.
    """
    model = _ensure_model()
    query_vector = model.encode([spoken_text], normalize_embeddings=True)[0].tolist()

    conn = get_connection()
    try:
        ensure_tables(conn, model.get_sentence_embedding_dimension())
        rows = conn.execute(
            "SELECT id, translation, text FROM verses WHERE book = ? AND chapter = ? AND verse = ?",
            (book, chapter, verse),
        ).fetchall()

        rankings: list[TranslationRanking] = []
        for verse_id, translation, text in rows:
            embedding_row = conn.execute(
                "SELECT embedding FROM verse_vectors WHERE rowid = ?", (verse_id,)
            ).fetchone()
            if embedding_row is None:
                continue
            stored_vector = from_blob(embedding_row[0])
            similarity = sum(q * s for q, s in zip(query_vector, stored_vector))
            rankings.append(TranslationRanking(translation=translation, text=text, similarity=similarity))

        rankings.sort(key=lambda r: -r.similarity)
        return rankings
    finally:
        conn.close()
