# Phase 03 — Backend Core & Manual Search

## What to accomplish

- Build out the named function layer (§6.1/§6.2) for real: `get_verse`, `get_song`, `save_song`, `start_service_set`, `get_active_set`, `clear_service_set` — reading from the Bible data landed in Phase 02. `parse_song_sheet` is stubbed here and fully implemented in Phase 07; for now, songs can be created directly via `save_song` with manually-entered lines.
- REST routes (`routes/bible.py`, `routes/songs.py`, `routes/service.py`) that call those functions — no raw SQL or direct ORM queries in route handlers, per §6's stated reason (swapping the DB later means changing one layer, not every call site).
- The WebSocket endpoint from PDD §13 (`ConnectionManager`, `/ws`), so the operator console has a live push channel wired up even before matching produces anything to push.
- A manual search path in the operator console: type a reference or song title, get it back, confirm it, see it delivered over the WebSocket. This is the same "request → validate → write → read" loop the PDD's minimal runnable version (§7) demonstrates, now running against real data instead of the throwaway `Song` table in that section.

## Objective

Prove the whole plumbing — HTTP in, DB function layer, WebSocket out — works end to end against real verse/song data, before adding STT or matching on top of it. If this loop is solid, every later phase is "produce a suggestion," not "figure out how suggestions reach the screen."

## Expected outcomes

- An operator can manually search for a verse (`book`, `chapter`, `verse`, `translation`) or a song by title and get a result back from the API.
- Confirming that result pushes it over the WebSocket to a connected client (can just be a log line or Phase 01's display window at this point).
- `start_service_set` / `get_active_set` / `clear_service_set` work against a real service-state table, even though nothing yet populates "today's set" automatically.
- No route or worker in the codebase queries the DB directly — everything goes through `app/data/*.py`.

## Code quality guardrails

- One search implementation per content type. Don't write a separate "quick lookup" query in the route file "just for this endpoint" when `get_verse`/`get_song` already exist.
- Delete the commented-out `api_router`/`AppException` scaffolding in `backend/app/main.py` once the real router and exception handler exist — don't leave both the comment and the real code side by side.

## Inputs needed from you

None specific to this phase — it consumes Phase 00's DB decision and Phase 02's data, both already resolved by the time this starts.
