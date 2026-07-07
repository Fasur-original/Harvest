# Phase 08 — Multiple Bible Translations

**Status: Complete.**

## What was found already done

All four translations (KJV, ASV, YLT, WEB) were loaded back in Phase 02, and it turned out `embed_and_store_verses()` (Phase 05) already embeds every row in the `verses` table regardless of translation, since it has no translation filter of its own — checked the live index directly rather than assuming: 124,409 embedded rows split as KJV 31,102 / ASV 31,102 / YLT 31,102 / WEB 31,103. So "embed the remaining three" was already true before this phase started; the actual open work was the translation-naming regex and the per-service default.

## What was built

- **`detect_translation(text)`** (`app/matching/regex_match.py`) — catches a spoken translation name anywhere in the line ("Turn to John 3:16... let's read that in the King James"), independent of where it falls relative to the reference itself. Requires a lead-in phrase (`in/from/using the ___`) rather than matching a bare name anywhere in the text — "WEB" is also an ordinary English word ("a web of lies"), and without the lead-in, unrelated speech would misfire. Verified directly: real phrasings for all four translations resolve correctly, `"a spider web is amazing"` and plain unrelated speech both correctly return no match.
- **Per-service default translation** — `ServiceSet` gained a nullable `default_translation` column (`app/models/service_set.py`), settable via `POST /service/start` and returned from `GET /service/active`. Existing installs get the column added in place on next startup (`app/main.py`'s lifespan checks `PRAGMA table_info` and runs the `ALTER TABLE` only if missing) — there's no Alembic in this project yet, and a single nullable column doesn't justify introducing one.
- **Translation resolution precedence** in `find_match` (`app/matching/pipeline.py`): an explicit spoken translation wins outright; otherwise today's active service's `default_translation` if one was set; otherwise the install-wide `.env` default (`MATCH_DEFAULT_TRANSLATION`). Same "today's context first, then the permanent default" shape Phase 07 already used for song scoping.
- **Embedding-path verses now respect the resolved translation, not whichever translation happened to match closest.** Every translation's own wording is embedded separately (§5.2), so a paraphrase's nearest KNN neighbor could legitimately be, say, the YLT wording of a verse even when the service default is KJV. `find_match` re-fetches the same `(book, chapter, verse)` in the resolved translation for display, falling back to whichever translation the embedding search actually found only if that exact reference doesn't exist there — a real case, not hypothetical: WEB has one more verse than the other three in this data set (versification differs slightly).
- **Operator UI**: a new "Today's service" section in `OperatorConsole.tsx` — pick a default translation (or leave it as the install default), Start/Update/Clear. There was no existing UI for `/service/start` at all before this (Phase 07 only exercised it via direct API calls), so this doubles as the first frontend entry point for it; "Update Service" re-sends whichever songs are already in the active set rather than wiping them, since `/service/start` replaces the whole set.

## Verification performed

Against a live backend and the real dev database:

- `POST /service/start` with `default_translation: "ASV"` → `find_match("John 3:16")` (no translation named) resolved to ASV text.
- `find_match("John 3:16 in the King James")` on the same active service → resolved to KJV, confirming the explicit-mention override beats the service default.
- A paraphrase of John 3:16 with no reference spoken (embedding fallback) also resolved to ASV — confirming the embedding path's re-fetch-in-preferred-translation logic, not just the regex path.
- `PRAGMA table_info` on the live `harvest.db` before/after a server reload confirmed the self-healing column migration ran in place, without touching existing rows.
- Frontend type-checks and production build both clean.

## Code quality guardrails

- `get_verse` and `search_by_embedding`/`search_by_vector` needed no changes at all — confirms Phase 03/05 already built the schema correctly per §5.2 ("translation is a column, not parallel logic").
- One `detect_translation` function, one precedence resolution in `find_match` — no per-translation branches anywhere in the matching code.

## Inputs needed from you

Copyrighted translations (TPT, The Message, etc.) remain out of scope pending licensing (PDD §15) — the four public-domain translations are the whole list `detect_translation` and the UI's dropdown know about. Extending either later is additive (new alias entries, new `<option>`), not a rework.
