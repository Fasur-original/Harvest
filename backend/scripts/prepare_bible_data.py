"""One-time, offline Bible data prep (Phase 02 — see app-phases/02-bible-data-ingestion.md).

Not shipped with the app. Downloads the four public-domain translations from their
source repos, normalizes book names to app.data.canonical_books.CANONICAL_BOOKS
(sources disagree, e.g. scrollmapper says "I Samuel" / "Revelation of John"), and
writes data/bible/<translation>.json in Harvest's own schema: a flat list of
{"book", "chapter", "verse", "text"} dicts per translation.

Sources:
- KJV, ASV, YLT: scrollmapper/bible_databases (one combined JSON file per translation)
- WEB: TehShrike/world-english-bible (one JSON file per book -- WEB.json doesn't
  exist in scrollmapper despite earlier assumptions; this is the actual World
  English Bible / ebible.org/web text)

Usage:
    python scripts/prepare_bible_data.py [--cache-dir DIR]

Raw downloads are cached in --cache-dir (default: a temp folder) so re-runs don't
re-fetch from the network.
"""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # backend/ -> importable as `app.*`

from app.data.canonical_books import CANONICAL_BOOKS  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
OUTPUT_DIR = REPO_ROOT / "data" / "bible"

SCROLLMAPPER_URL = "https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/json/{}.json"
WEB_BOOK_URL = "https://raw.githubusercontent.com/TehShrike/world-english-bible/master/json/{}.json"

# scrollmapper ships one combined file per translation with a fixed, well-known verse
# count -- a mismatch means the source data is incomplete/changed and needs a look.
KNOWN_VERSE_COUNTS = {"KJV": 31102, "ASV": 31102, "YLT": 31102}


def _fetch(url: str, cache_path: Path) -> bytes:
    if cache_path.exists() and cache_path.stat().st_size > 0:
        return cache_path.read_bytes()
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    last_error: Exception | None = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=60) as resp:
                data = resp.read()
            cache_path.write_bytes(data)
            return data
        except Exception as exc:  # noqa: BLE001 - retry on any transient network error
            last_error = exc
            time.sleep(2)
    raise RuntimeError(f"failed to fetch {url}") from last_error


def _web_slug(book: str) -> str:
    return book.lower().replace(" ", "")


def prepare_scrollmapper_translation(translation: str, cache_dir: Path) -> list[dict]:
    raw = _fetch(SCROLLMAPPER_URL.format(translation), cache_dir / f"{translation}.json")
    books = json.loads(raw)["books"]
    if len(books) != 66:
        raise ValueError(f"{translation}: expected 66 books, got {len(books)}")

    rows = []
    for canonical_name, book in zip(CANONICAL_BOOKS, books):
        for chapter in book["chapters"]:
            for verse in chapter["verses"]:
                rows.append(
                    {
                        "book": canonical_name,
                        "chapter": chapter["chapter"],
                        "verse": verse["verse"],
                        "text": verse["text"].strip(),
                    }
                )

    expected = KNOWN_VERSE_COUNTS.get(translation)
    if expected is not None and len(rows) != expected:
        raise ValueError(f"{translation}: expected {expected} verses, got {len(rows)}")

    return rows


def prepare_web(cache_dir: Path) -> list[dict]:
    rows = []
    for canonical_name in CANONICAL_BOOKS:
        slug = _web_slug(canonical_name)
        raw = _fetch(WEB_BOOK_URL.format(slug), cache_dir / "web" / f"{slug}.json")
        entries = json.loads(raw)

        verse_order: list[tuple[int, int]] = []
        verse_parts: dict[tuple[int, int], list[str]] = {}
        for entry in entries:
            # Structural markers (paragraph/stanza start/end, break) carry no verse text.
            if "chapterNumber" not in entry or "verseNumber" not in entry:
                continue
            key = (entry["chapterNumber"], entry["verseNumber"])
            if key not in verse_parts:
                verse_parts[key] = []
                verse_order.append(key)
            verse_parts[key].append(entry["value"])

        for chapter, verse in verse_order:
            text = " ".join("".join(verse_parts[(chapter, verse)]).split())
            rows.append({"book": canonical_name, "chapter": chapter, "verse": verse, "text": text})

    if len(rows) < 31000:
        raise ValueError(f"WEB: suspiciously low verse count {len(rows)} (expected ~31,100)")

    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--cache-dir",
        default=str(Path(tempfile.gettempdir()) / "harvest_bible_raw"),
        help="Where raw downloads are cached between runs.",
    )
    args = parser.parse_args()
    cache_dir = Path(args.cache_dir)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    for translation in ("KJV", "ASV", "YLT"):
        print(f"Preparing {translation}...")
        rows = prepare_scrollmapper_translation(translation, cache_dir)
        out_path = OUTPUT_DIR / f"{translation.lower()}.json"
        out_path.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
        print(f"  wrote {len(rows)} verses -> {out_path}")

    print("Preparing WEB...")
    rows = prepare_web(cache_dir)
    out_path = OUTPUT_DIR / "web.json"
    out_path.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
    print(f"  wrote {len(rows)} verses -> {out_path}")


if __name__ == "__main__":
    main()
