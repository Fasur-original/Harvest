"""Bulk-embeds verses and song lines for embedding search (Phase 05).

Deliberately a separate, explicitly-run script rather than an auto-run-on-
startup step like Phase 02's Bible text load: embedding the full ~124k verse
corpus takes on the order of 20+ minutes (bge-small on a modest CPU -- see
app-phases/05-matching-logic.md for measured numbers), which is too long to
block silently on every fresh install. Safe to re-run any time -- both
embed_and_store_* functions are idempotent and only embed rows not already
in the index.

Usage: python scripts/embed_content.py
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # backend/ -> importable as `app.*`

from app.matching.vector_match import embed_and_store_song_lines, embed_and_store_verses  # noqa: E402


def main() -> None:
    print("Embedding verses...")
    t0 = time.time()
    count = embed_and_store_verses()
    print(f"  {count} verses embedded in {time.time() - t0:.1f}s")

    print("Embedding song lines...")
    t0 = time.time()
    count = embed_and_store_song_lines()
    print(f"  {count} song lines embedded in {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
