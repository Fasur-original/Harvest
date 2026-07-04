# Phase 02 — Bible Data Ingestion (Public-Domain Translations)

**Status: Complete.**

## Why this is its own phase

Every later phase that touches Bible content — manual search (03), matching (05), multiple translations (08) — depends on real verse text existing in the database first. Getting this data is also the one step in the whole project with a genuine legal constraint, so it's worth isolating and getting right before anything is built on top of it, rather than discovering a licensing problem mid-way through Phase 05.

**Confirmed scope: KJV, ASV, YLT, WEB only.** These are the public-domain translations named in the PDD (§5.2, §15). Anything else (TPT, The Message, NIV, ESV, etc.) requires licensing the PDD explicitly says to settle before going live, and is out of scope until that happens.

## Data sources (resolved — corrected mid-build)

The repo originally proposed (`jadenzaleski/bible-translations`) builds its data by live-scraping biblegateway.com via the `meaningless` package — its own README says the pre-built files were removed over copyright concerns, so using it means running that scrape against a site whose Terms of Service around automated access isn't verified. That was ruled out.

**KJV, ASV, YLT: `scrollmapper/bible_databases`** (MIT-licensed, GitHub). Ships pre-built, ready-to-use `KJV.json`, `ASV.json`, `YLT.json` — one combined file per translation, no scraping, no live site dependency.

**WEB: `TehShrike/world-english-bible`, not scrollmapper.** Initial research claimed scrollmapper also had a `WEB.json` — that was wrong (a hallucinated read of a truncated directory listing). The actual scrollmapper repo has no World English Bible file at all (checked via the GitHub contents API directly, not a summarized fetch). The World English Bible is a separate, deliberate dataset maintained by `TehShrike/world-english-bible`, sourced from ebible.org/web, shipped as one JSON file per book (66 files) rather than one combined file. Confirmed correct before use: `curl` against the GitHub API contents endpoint, cross-checked against `TehShrike/books-of-the-bible`'s canonical 66-book list.

## What was built

- **`backend/app/data/canonical_books.py`** — the 66 Protestant-canon book names in order, once, shared by everything downstream. Needed because sources disagree on naming: scrollmapper's KJV/ASV/YLT say "I Samuel" and "Revelation of John"; the canonical list says "1 Samuel" and "Revelation". Without normalizing to one name per book, a cross-translation lookup on the same reference would silently miss.
- **`backend/app/models/verse.py`** (+ `backend/app/models/base.py` for the shared `DeclarativeBase`) — the `verses` table: `book`, `chapter`, `verse`, `translation`, `text`, unique on `(book, chapter, verse, translation)`.
- **`backend/scripts/prepare_bible_data.py`** — the one normalization script (dev-only, not shipped). Downloads all four sources (cached locally so re-runs don't re-hit the network), normalizes book names against the canonical list, and writes `data/bible/{kjv,asv,ylt,web}.json` in Harvest's own flat schema: `{"book", "chapter", "verse", "text"}` per row (translation is implied by the filename).
- **`backend/app/data/verses.py`** — `load_translation` / `load_all_translations`, the one shared, idempotent loader (upserts by `(book, chapter, verse)` per translation, skips unchanged rows). This is shipped app code — it's what an installed copy of the app would run once to populate its local SQLite from the bundled `data/bible/*.json`.
- **`backend/scripts/load_bible_data.py`** — thin CLI entrypoint that creates the table (`Base.metadata.create_all`, no Alembic migration yet — same pattern the PDD's own minimal runnable example in §7 uses) and calls the loader for all four translations.

## Verification performed

- Row counts: KJV 31,102 / ASV 31,102 / YLT 31,102 / WEB 31,103 — all match scrollmapper's known-good KJV/ASV/YLT total exactly (31,102 is the well-known KJV verse count). WEB's one extra verse is a genuine versification difference (Romans has 434 verses in WEB vs. 433 in KJV — some translations include Romans 16:24, some don't) confirmed by diffing per-book counts, not a parsing bug.
- Book count: 66 distinct book names per translation, matching the canonical list exactly.
- Spot-checked John 3:16, Genesis 1:1, and 1 Samuel 2:1 (chosen specifically to exercise a numbered book) across all four translations directly against the loaded SQLite database — correct text in each, and the numbered-book canonicalization (`"1 Samuel"`, not scrollmapper's `"I Samuel"`) resolved correctly.
- Re-ran the loader against already-loaded data: 0 rows written for all four translations, confirming the upsert is idempotent — no duplicate-key errors, no duplicate rows.
- A `�` observed when printing WEB's 1 Samuel 2:1 to a terminal was checked down to the codepoint (`0x201c`, a left curly double-quote) and confirmed correctly stored in both the JSON and SQLite — a terminal rendering limitation, not data corruption.

## Code quality guardrails

- One loader function used for all four translations — confirmed: `load_translation` is parameterized by translation, not duplicated per translation.
- One normalization script converting each source's shape into Harvest's schema, run once per translation (including WEB's per-book reconstruction) — confirmed: `prepare_bible_data.py` is the only place source-specific parsing logic lives.
- The scrape/prep script and its cache live outside the shipped app (`backend/scripts/`, cache in the OS temp dir) — flagged again for Phase 10 to confirm it's excluded from the PyInstaller bundle.

## Inputs needed from you

None. Sourcing, scope, and format are resolved and verified above.
