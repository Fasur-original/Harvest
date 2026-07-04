# Phase 00 — Foundations & Environment Alignment

## What's already there

The repo isn't empty: `backend/` has a FastAPI skeleton (`main.py`, `config.py`, `database.py`), `desktop/` is an unmodified Tauri + React + Vite template, and `worker/` exists but is empty. This phase reconciles that scaffold with the architecture in the PDD before any feature work starts — otherwise every later phase inherits mismatches nobody decided on purpose.

One mismatch exists right now and is resolved below:

- `backend/app/database.py` and `config.py` were wired for Postgres/`asyncpg` only. **Decision: support both**, driver-selected off `DATABASE_URL`'s scheme, rather than picking one and hardcoding it. This is actually the more faithful reading of §6/§12 anyway — the whole point of the named function layer is that swapping SQLite for Postgres later means changing a connection string, not rewriting call sites.
- `desktop/src-tauri/tauri.conf.json` and `Cargo.toml` still say `tauri-app` / `com.jaasa.tauri-app` — generic template identifiers, not Harvest's.

## What to accomplish

- Make `database.py` driver-agnostic: branch the async engine driver off the `DATABASE_URL` scheme (`sqlite+aiosqlite:///...` for local/desktop, `postgresql+asyncpg://...` for hosted/Postgres) instead of unconditionally rewriting the URL to `postgresql+asyncpg://`. Add `aiosqlite` to `requirements.txt` alongside the existing `asyncpg`. Default `.env.example` to a local SQLite file (e.g. `sqlite+aiosqlite:///./harvest.db`) so desktop dev needs no external DB server, per §5.4 — the same function layer (§6) then works unchanged against either engine.
- Note the one real limit of "both": `sqlite-vec` (local embeddings, Phase 05) and `pgvector` (hosted embeddings, Phase 11) are different extensions with different column types. Supporting both DB engines at the connection-string level in this phase does **not** mean the embeddings schema is engine-agnostic yet — that split is handled explicitly when Phase 11 (hosted) starts. This phase's scope is: routes/functions/session handling work against either engine; vector search specifics are a later, separate concern.
- Rebrand the desktop shell: `productName`, `identifier`, and window title in `tauri.conf.json`, package name in `Cargo.toml`, app name/version in `backend/app/config.py` (already says "Harvest" — keep it, just confirm consistency).
- Replace every default Tauri/Vite/React asset (`react.svg`, `vite.svg`, `tauri.svg`, the default app icon set under `src-tauri/icons/`) with the Harvest icon, once the source file is in hand (see Inputs below).
- Scaffold the folder structure the PDD's repository layout (§11) expects but doesn't exist yet: `backend/app/routes/`, `backend/app/matching/`, `backend/app/data/`, `data/bible/`, `data/songs/library/`. Empty packages with `__init__.py` are fine here — they get filled in phases 02–07, not this one.
- Decide the fate of `worker/`: the PDD says the *hosted* version runs `stt_worker.py`/`embed_worker.py` as separate processes coordinated by Redis (§4), but the *desktop* build folds them into the backend process as background tasks (§14, explicit: "don't ship stt_worker.py / embed_worker.py as separate executables" for desktop). Since desktop ships first, `worker/` scripts should be written as importable modules the backend calls in-process, not as standalone entrypoints, until Phase 11 needs otherwise.
- Add `.env.example` (covering `DATABASE_URL`, `SECRET_KEY`, etc. already referenced in `config.py`) so `pydantic-settings` doesn't fail on a missing required field for the next person who clones the repo.
- Root `README.md` currently is a bare `# Harvest` — add real setup steps (backend venv + install, desktop `pnpm install`, how to run both).

## Objective

Give every later phase a consistent, PDD-aligned base to build on, so the work in phases 01–10 is additive rather than "fix the foundation while also building the feature."

## Expected outcomes

- `uvicorn app.main:app --reload` boots cleanly against a local SQLite file with no missing-env-var crash (given a `.env` populated from `.env.example`), and boots equally cleanly if `DATABASE_URL` is pointed at a Postgres instance instead.
- `pnpm tauri dev` opens a window titled "Harvest," using the Harvest icon, with no leftover Vite/Tauri template UI.
- Folder layout matches PDD §11 (even where files are still empty stubs).
- `.env.example` and a real root `README.md` exist.

## Code quality guardrails

- Don't fork `database.py` into two files ("sqlite_database.py" / "postgres_database.py") to support both engines — one file, one engine-detection branch, one set of session/engine objects the rest of the app imports.
- Don't leave the default Tauri counter/demo component code commented out in `App.tsx` — delete it once replaced.
- Empty stub packages from the folder scaffolding should contain nothing but `__init__.py` — no placeholder classes or TODO functions that will just be rewritten in Phase 03+.

## Inputs needed from you

None remaining. Icon source resolved: `desktop/public/harvest.png` (icon-only mark, 1254×1254, no wordmark) is the app/window icon, run through Tauri's icon generator for all required sizes (`32x32`, `128x128`, `128x128@2x`, `.icns`, `.ico`, the Windows Store tile set already scaffolded under `src-tauri/icons/`). `desktop/public/harvest v2.png` (mark + wordmark) is kept available for an about screen or splash usage later, not used as the app icon itself since the wordmark would crop badly at small sizes.
