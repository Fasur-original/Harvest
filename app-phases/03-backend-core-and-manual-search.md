# Phase 03 — Backend Core & Manual Search

**Status: Complete.**

## What was accomplished

- Named function layer (§6.1/§6.2) built out for real: `get_verse` (added to `app/data/verses.py`), and new `app/data/songs.py` (`save_song`, `get_song`, `search_songs`) and `app/data/service_state.py` (`start_service_set`, `get_active_set`, `clear_service_set`). `parse_song_sheet` stays stubbed for Phase 07 — songs are created directly via `save_song` with manually-entered lines for now.
- New models: `Song` / `SongLine` (`app/models/song.py`), `ServiceSet` (+ the `service_set_songs` join table, `app/models/service_set.py`).
- REST routes: `app/routes/bible.py` (`GET /bible/verse`), `app/routes/songs.py` (`POST /songs`, `GET /songs?q=`, `GET /songs/{id}`), `app/routes/service.py` (`POST /service/start`, `GET /service/active`, `POST /service/clear`) — aggregated in `app/routes/__init__.py` as `api_router`. No route touches the DB directly; everything goes through `app/data/*.py`.
- WebSocket endpoint per PDD §13: `app/ws.py` (`ConnectionManager`, `manager.send_to_all`), wired into `main.py`'s `/ws` route. A `{"action": "confirm", ...}` message from any connected client is broadcast to every connected client — verified with two simultaneous WebSocket connections.
- `main.py`'s startup `lifespan` now creates tables and auto-loads all four translations from `data/bible/*.json` if the `verses` table is empty (using Phase 02's `load_all_translations`) — the app now populates its own local DB on first run rather than requiring a manual script.
- Manual search UI in the operator console: verse search (book/chapter/verse/translation), song title search, a Confirm button per result, and a WebSocket status/last-message panel.
- Dead scaffolding removed: the commented-out `api_router`/`AppException` placeholders in `main.py` are gone, replaced by the real thing.

## A bug found and fixed during verification

The first working version had Confirm buttons that sent content over the *backend* WebSocket, but `DisplayWindow.tsx` (Phase 01) still only listened to the *Tauri-native event bus* from Phase 01's "Show Sample Verse/Song" buttons — two disconnected channels. Confirming a verse never reached the projector; the display just kept showing whatever sample content was last pushed via the old mechanism. Caught via user testing (automated REST/WebSocket checks alone didn't surface it, since they didn't exercise the actual `DisplayWindow` component).

Fix: `DisplayWindow.tsx` now subscribes to the real backend WebSocket (`useBackendSocket`, the same hook the operator console uses) instead of the Tauri event bus. The Phase 01 "mechanics check" buttons and `lib/display-bus.ts` are removed — they were explicitly a throwaway placeholder per Phase 01's own doc ("Tauri events... this phase is a mechanics check, not the real pipeline"), and leaving both paths active was exactly the kind of duplicate-push-mechanism the project's guardrails warn against. Also fixed along the way: `confirmSong` originally sent only `{id, title}` with no line text at all (would have silently failed the same way) — it now fetches the full song and sends its first line's text, since display is line-by-line (PDD §5.3.1) even though search is by title.

## Verification performed

- Every REST endpoint exercised directly (`curl`): verse lookup (found + 404), song create/search/get-by-id (found + 404), service set start/active/clear (including the active→cleared→404 transition).
- WebSocket broadcast verified with two simultaneous connections (simulating operator console + display window) — a confirm message sent on one connection is received on both, for both verse and song payload shapes.
- Frontend type-checks (`tsc --noEmit`) and production build (`pnpm build`) both clean after the fix.
- Visually confirmed end-to-end by the user: search → confirm → projector window updates correctly.

## Code quality guardrails

- One search implementation per content type — confirmed, no ad hoc queries in route files.
- Exactly one thing reaches the projector display now (`DisplayWindow`'s backend WebSocket subscription) — the Phase 01 placeholder path is gone, not left running alongside it.

## Inputs needed from you

None — this phase is complete.
