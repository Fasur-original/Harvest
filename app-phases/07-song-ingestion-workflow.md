# Phase 07 — Song Ingestion Workflow

**Status: Complete.**

## A deliberate deviation from the PDD's proposed column layout

Asked upfront: design the sheet format to be easy to parse *and* not tedious for whoever fills it in. The PDD's own proposed layout (§10) included a `line_number` column — typing a sequential number on every single row, and keeping it in sync if a line ever gets reordered, is exactly the kind of manual bookkeeping worth designing out. **Line order now comes from row order instead** — whoever fills in the sheet just types lyrics top to bottom, nothing else. `repeat_count` is optional and defaults to 1 when blank, so it only needs filling in on the rare line that actually repeats (a chorus sung 3x), not on every row.

Final format per tab: a header row with `line_text` (required) and `repeat_count` (optional), then one lyric line per row. Verified this parses correctly and defaults `repeat_count` to 1 exactly as intended (test workbook: a tab with an explicit `repeat_count` column had one row correctly repeat_count=2 and the rest defaulted to 1; a second tab with *no* `repeat_count` column at all had every line default to 1).

One tab looks like this (tab name = song title):

| line_text | repeat_count |
| --- | --- |
| Amazing grace, how sweet the sound | |
| That saved a wretch like me | |
| I once was lost, but now am found | 3 |
| Was blind, but now I see | |

Blank `repeat_count` cells default to 1; only fill it in for a line sung more than once.

Since a table in a doc isn't the same as seeing the real thing, added a **`GET /songs/template`** endpoint (`build_song_sheet_template` in `app/data/songs.py`) that returns a real, downloadable `.xlsx` with exactly the example above pre-filled in a tab named "Example Song (copy this tab)" — right-click → duplicate that tab per new song rather than building the column layout from memory each time. Verified the generated template is self-consistent: feeding it straight back into `parse_song_sheet` parses 1 song / 0 errors. Both `UploadSongSheet.tsx` (a "Download a blank template" link, plus the same table inlined above the file picker) and `QuickAddSong.tsx` (a plain-text worked example above the textarea, since quick-add has no `repeat_count` field — repeats are just typed out as repeated rows) now show this structure directly in the UI instead of leaving it to a placeholder string or separate documentation.

## What was built

- **`app/data/songs.py`**: `parse_song_sheet(file)` — reads a workbook via `openpyxl`, treats each tab as one song (tab name = title), validates the header row per tab independently. **Best-effort partial import** (your call): a malformed tab (missing `line_text` column, a non-numeric `repeat_count`, a duplicate tab name) is recorded as an error naming that exact tab and problem, and skipped — it does not fail the other, valid tabs in the same workbook. Duplicate tab names are checked explicitly rather than assumed impossible — confirmed via direct testing that the xlsx format doesn't actually prevent two sheets sharing a name (openpyxl allows constructing one), so this validation is a real, meaningful check, not defensive-programming theater.
- **`save_song` now upserts by title** — re-uploading a song already in the permanent library (a real scenario: a repeat song accidentally included in a new week's workbook) replaces its lines instead of creating a duplicate entry that would clutter search and matching. Uses the existing `cascade="all, delete-orphan"` on `Song.lines` to replace cleanly.
- **`POST /songs/upload`** — accepts a multipart `.xlsx` file, parses it, saves every valid tab via the same `save_song` Phase 03 already built, then triggers **one batched embedding call** for the whole workbook (not one per song) via Phase 05's `embed_and_store_song_lines`. Returns the import result: which songs were imported, and the exact tab/problem for anything skipped.
- **`POST /songs`** (Phase 03's existing quick-add-compatible endpoint) now also triggers embedding after save — previously songs created this way were saved but never became searchable via the matching pipeline, since nothing called the Phase 05 embedding step. Both entry paths call the exact same `save_song` and the exact same embedding function; no separate quick-add storage shape.
- **Today's-set-first search scoping (PDD §10.5)**, added to `app/matching/pipeline.py`: song search now checks the current service's active set first (if one exists and has songs), only falling back to the full permanent library if nothing in today's set clears the confidence threshold. Implemented in `search_by_vector` via an optional `song_ids` filter, applied by over-fetching from the vec0 index and filtering in Python rather than depending on whatever WHERE-clause filtering syntax a given `sqlite-vec` version does or doesn't support.
- **`desktop/src/operator/UploadSongSheet.tsx`** (primary flow) and **`QuickAddSong.tsx`** (mid-service fallback, PDD §10.4) — both call into the same backend paths above; no separate frontend-side storage logic either.

## Verification performed

Built a real test workbook (3 tabs: one with explicit `repeat_count` values, one with the column omitted entirely, one deliberately broken with a wrong column name) and ran the full path end-to-end against a live backend:

- Upload correctly imported the 2 valid songs and reported exactly one error naming the broken tab and the missing column.
- `song_line_vectors` gained exactly 6 rows (4 + 2 lines) — embedding triggered correctly on upload.
- Manual search (`GET /songs?q=`) found the imported song.
- `find_match` correctly resolved a paraphrase of each uploaded song's lyrics to the right song, at ~0.98 confidence.
- Today's-set scoping: after starting a service set containing only one of the two uploaded songs, a paraphrase of *that* song still resolved correctly (today's-set-first path), and a paraphrase of the *other* uploaded song (not in today's set) still resolved correctly too — proving the fallback to the full library actually works, not just the primary scoped path.
- Frontend type-checks and production build both clean.

## Code quality guardrails

- One parser (`parse_song_sheet`), one storage function (`save_song`), one embedding trigger (`embed_and_store_song_lines`) — used identically by both the workbook-upload path and the quick-add fallback. No second storage shape or second matching implementation for songs.
- `search_by_vector`'s scoping filter only applies to the "songs" scope; verses remain unscoped, since there's no per-service concept for shared verse data.

## Inputs needed from you

Both of the PDD's open questions for this phase are now resolved: the column layout was redesigned per your stated priority (easy to parse, low tedium) rather than kept as originally proposed, and malformed uploads use best-effort partial import per your choice. Nothing blocking remains.
