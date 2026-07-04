# Phase 07 — Song Ingestion Workflow

## What to accomplish

- `parse_song_sheet` (§6.1, §10.2), implemented for real this time (Phase 03 stubbed it): reads one uploaded workbook per service, treats each **tab** as one song (tab name = title), validates the expected columns (`line_number`, `line_text`, `repeat_count`) per tab using `openpyxl`.
- Validation errors name the exact tab and exact problem (duplicate tab name, missing column) rather than failing generically — PDD §10.3 calls this out specifically as a requirement, not a nice-to-have.
- `save_song` stores the parsed lines and triggers per-line embedding (feeding the same embedding infrastructure Phase 05 built for verses).
- `UploadSongSheet.tsx` (primary flow) and `QuickAddSong.tsx` (paste-and-embed fallback for mid-service exceptions, §10.4) — both end up calling the same `save_song`, not two different storage paths.
- Search scoping per §10.5: check today's uploaded set first, fall back to the full permanent song library only if nothing in today's set matches well.

## Objective

Make getting song content into the system fast enough that it's not the weekly bottleneck — per PDD §10, this is "a data-entry and speed problem, not a training problem." A church that has to hand-type lyrics every week won't keep using the app.

## Expected outcomes

- Uploading a workbook with N tabs produces N songs, each with ordered lines and a `repeat_count`, each line embedded and searchable.
- A malformed tab (bad column, duplicate name) produces a specific, actionable error before the service starts — not a mid-service surprise.
- A song matched during a live service is found first from today's uploaded set, and only falls back to the full library if nothing in today's set scores well.
- `QuickAddSong.tsx` and `UploadSongSheet.tsx` both land in the same DB rows via the same `save_song` call — no separate quick-add storage table or shape.

## Code quality guardrails

- One parser, one validator, one storage function (`save_song`) regardless of entry path (workbook upload vs. quick-add paste).
- Song matching still calls the exact same `search_by_embedding` from Phase 05 — this phase adds data, it does not add a second matching implementation for songs.

## Inputs needed from you

- **A real sample song-sheet workbook from the choir.** PDD §16 flags this directly: the `line_number` / `line_text` / `repeat_count` column layout is a *proposed* default, not confirmed against what the choir actually produces. Building the parser against a guessed format risks a rewrite later — a real sample file (even a small one) should come before `parse_song_sheet` is finalized.
- **Reject-outright vs. best-effort partial import.** Also an open PDD question (§16): if a workbook has one broken tab among ten good ones, should the whole upload fail, or should the nine good tabs import with a report on the broken one?
