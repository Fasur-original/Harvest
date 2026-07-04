# Harvest

An app that listens to a live church service, recognizes when someone is reading a Bible verse or singing a song, and surfaces the matching text for the projector — with an operator confirming every match before it goes live. See `AI-Church-Display-App-PDD (1).md` for the full product design, and `app-phases/` for the phase-by-phase build plan.

## Repository layout

```text
backend/    FastAPI app: routes, matching (regex + embeddings), named DB function layer
desktop/    Tauri + React desktop shell: operator console + projector output window
workers/    STT/embedding modules, imported in-process by the backend (see workers/README.md)
data/       Shipped data: Bible translations, song library
app-phases/ Build plan, one file per phase
```

## Prerequisites

- Python 3.11+
- Node.js + [pnpm](https://pnpm.io/)
- Rust toolchain (required by Tauri) — [rustup.rs](https://rustup.rs/)

## Backend setup

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
copy .env.example .env       # Windows
# cp .env.example .env       # macOS/Linux
```

`.env` defaults to a local SQLite file — no external database is needed for desktop dev. Then run:

```bash
uvicorn app.main:app --reload
```

API docs at `http://localhost:8000/api/docs`, health check at `http://localhost:8000/health`.

## Desktop setup

```bash
cd desktop
pnpm install
pnpm tauri dev
```

This starts the Vite dev server and opens the Harvest desktop window. The backend (above) needs to be running separately in dev — Phase 10 bundles it as a Tauri sidecar so the packaged app starts it automatically.

## Where to start

Nothing is implemented beyond the Phase 00 foundations (rebranded shell, driver-agnostic DB layer, folder scaffolding). Read `app-phases/README.md` for the build order, then `app-phases/01-static-display-shell.md` for the next phase.
