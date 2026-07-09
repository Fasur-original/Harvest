"""LLM-assisted classification/cleanup step for the live matching pipeline.

A small local Ollama model (llama3.2:1b, quantized -- see app/config.py)
classifies each distinct thing said or sung in a transcript chunk as a verse
reference, a song lyric, or neither, and cleans up transcription noise. It
never generates verse or lyric text itself -- get_verse/search_by_embedding
still do every real lookup afterward. Every "verse" item it returns passes
through a deterministic bounds check (verse_bounds.py) before being trusted;
a small model can be talked into confidently repeating its own mistake, so
the guard against that can't depend on the model grading itself.

Only invoked from app/routes/transcript.py's broadcast loop, and only when
regex alone found no direct reference -- see that module for the "regex
first" ordering this respects.
"""

from __future__ import annotations

import json
import logging

import httpx

from app.config import settings
from app.matching import llm_cleanup_state
from app.matching.regex_match import normalize_translation_name
from app.matching.verse_bounds import validate_reference

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """You classify a snippet of live church-service transcript. Respond with JSON only, no other text.

The speaker could be a preacher, worship leader, choir, or congregation -- don't assume a role, and don't assume a song is always introduced with spoken words first.

For each distinct thing said or sung, classify it as one of:
- "verse": a specific Bible scripture reference is being cited (e.g. "Romans chapter 8 verse 28"). Only use a real, canonical Bible book name. If you are not confident the book name is correct, classify it as "song" or omit it -- never guess at a book name. If a specific translation is named alongside the reference (e.g. "in the KJV", "the Young's Literal Translation", "the ESV"), put its name or abbreviation in "translation" exactly as spoken; otherwise "translation" is null -- never guess at a translation that wasn't actually named.
- "song": a spoken introduction to a song, OR sung lyric text transcribed with no introduction at all. Sung lyrics picked up directly must still be classified as "song", not omitted. Give "cleaned_text": your best guess at the correct wording with transcription errors fixed.
- If neither applies, omit it entirely. Do not force a classification onto unrelated speech.

Never invent or complete a verse or lyric you don't recognize from the input. Only classify and clean what was actually captured.

Respond with exactly this JSON shape, always a list even for a single item:
{"items": [{"type": "verse", "book": "Romans", "chapter": 8, "verse": 28, "translation": null}, {"type": "verse", "book": "John", "chapter": 3, "verse": 16, "translation": "YLT"}, {"type": "song", "cleaned_text": "let's stand and sing Amazing Grace"}]}
"""


def _coerce_int(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip().lstrip("-").isdigit():
        return int(value.strip())
    return None


async def _validate_raw_item(raw: object) -> dict | None:
    if not isinstance(raw, dict):
        return None

    if raw.get("type") == "verse":
        book = raw.get("book")
        chapter = _coerce_int(raw.get("chapter"))
        verse = _coerce_int(raw.get("verse"))
        if not isinstance(book, str) or chapter is None or verse is None:
            return None
        validated = await validate_reference(book, chapter, verse)
        if validated is None:
            return None
        canonical_book, valid_chapter, valid_verse = validated
        translation = raw.get("translation")
        # Normalized through the same alias table detect_translation uses
        # for the regex path, not passed through raw -- the model might say
        # "Young's Literal" or "the ESV" instead of the canonical code, and
        # an unrecognized string here would silently fail to match anything
        # downstream instead of being treated as "no translation named".
        normalized_translation = normalize_translation_name(translation) if isinstance(translation, str) else None
        return {
            "type": "verse",
            "book": canonical_book,
            "chapter": valid_chapter,
            "verse": valid_verse,
            "translation": normalized_translation,
        }

    if raw.get("type") == "song":
        cleaned = raw.get("cleaned_text")
        if isinstance(cleaned, str) and cleaned.strip():
            return {"type": "song", "cleaned_text": cleaned.strip()}
        return None

    return None


async def extract_items(text: str) -> list[dict]:
    """Classifies and cleans up a transcript chunk into a batch of verse/song
    items. Any error, timeout, or malformed response is caught and treated
    as an empty list -- this must never surface an error to the operator or
    interrupt the live service; the caller falls through to
    search_by_embedding on the raw chunk either way when this returns nothing.
    """
    if not llm_cleanup_state.is_enabled():
        return []

    prompt = f'{_SYSTEM_PROMPT}\nTranscript: "{text}"\n\nJSON:'
    try:
        async with httpx.AsyncClient(timeout=settings.LLM_CLEANUP_TIMEOUT_MS / 1000) as client:
            response = await client.post(
                f"{settings.LLM_CLEANUP_HOST}/api/generate",
                json={
                    "model": settings.LLM_CLEANUP_MODEL,
                    "prompt": prompt,
                    "format": "json",
                    "stream": False,
                    "keep_alive": settings.LLM_CLEANUP_KEEP_ALIVE,
                    "options": {
                        "num_predict": settings.LLM_CLEANUP_NUM_PREDICT,
                        "num_ctx": settings.LLM_CLEANUP_NUM_CTX,
                    },
                },
            )
            response.raise_for_status()
            raw_items = json.loads(response.json()["response"]).get("items", [])
            if not isinstance(raw_items, list):
                raw_items = []
    except Exception as exc:  # noqa: BLE001 -- any failure here must degrade silently, not break the live loop
        logger.warning("LLM cleanup call failed, falling back to embeddings: %s", exc)
        llm_cleanup_state.record_timeout_or_error()
        return []

    llm_cleanup_state.record_success()

    items: list[dict] = []
    for raw in raw_items[: settings.LLM_CLEANUP_MAX_ITEMS]:
        validated = await _validate_raw_item(raw)
        if validated is not None:
            items.append(validated)
    return items
