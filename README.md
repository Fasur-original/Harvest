# Harvest

An app that listens to a live church service, recognizes when someone is reading a Bible verse or singing a song, and surfaces the matching text for the projector — with an operator confirming every match before anything goes live. Matching runs regex first (instant, exact references), falls back to a local LLM cleanup/classification pass, and falls back again to embedding similarity search for paraphrases and half-remembered wording — nothing is ever auto-pushed to the display without the operator confirming it. See `AI-Church-Display-App-PDD (1).md` for the full product design, and `app-phases/` for the phase-by-phase build plan.

## What it does

- **Live transcription** of the service (`faster-whisper`, tunable model size/latency), speech-boundary-aware chunking rather than a fixed clock.
- **Verse matching**: regex reference detection ("John 3:16," spelled-out numbers, misheard book names via fuzzy matching) → local LLM cleanup (Ollama, `llama3.2:1b`) for noisier speech → embedding search (`sentence-transformers` + `sqlite-vec`) as the final fallback for paraphrases.
- **Song matching**: embedding search over an uploaded song library, scoped to today's service set first.
- **Multiple Bible translations** (KJV, ASV, YLT, WEB — all public-domain): a spoken translation name overrides the service's default; naming a real translation that isn't loaded flags it to the operator rather than failing silently.
- **"Closest match to what was said"**: on request, ranks every loaded translation of a verse by similarity to the preacher's own wording and lets the operator pick — never auto-selected.
- **Reading queue & song queue**: a preacher naming several references (or an operator building a song lineup) gets a live, reorderable worklist that tracks wherever they actually go, not just a fixed forward march.
- **Partial recall**: a half-remembered paraphrase that's too uncertain for one confident guess surfaces a ranked list of candidates instead of nothing.
- **Bulk song import**: CSV/XLSX upload with a preview-before-commit flow (fix a bad row before it's saved), plus a legacy one-tab-per-song workbook format.
- **Operator console**: light/dark themed, a live thumbnail mirror of whatever's actually on the projector, an AI-cleanup live/idle indicator, and a pending-match queue (newest on top) the operator confirms or skips one at a time.

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
- [Ollama](https://ollama.com/) running locally with `llama3.2:1b` pulled — optional. Powers the LLM cleanup step between regex and embedding matching; if it's not installed, not running, or the machine is low on free RAM, that step disables itself automatically and the pipeline falls straight back to embedding search with no crash and no manual configuration needed.

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

This starts the Vite dev server and opens the Harvest desktop window (an operator console window plus a separate projector output window — drag the latter onto a second display and toggle it fullscreen from the sidebar). The backend (above) needs to be running separately in dev — packaging it as a Tauri sidecar so a built app starts it automatically is still open (see Project status below).

## Project status

Phases 00–09 of `app-phases/` are complete: foundations, the two-window display shell, Bible data ingestion (four public-domain translations), the backend core + manual search, the STT pipeline, the regex→LLM→embedding matching pipeline, the operator confirmation loop, song ingestion, multiple translations, and partial recall + the reading queue. Read `app-phases/README.md` for what each phase covers in detail.

Beyond the phase plan, the operator console has since been rebuilt around Zustand state management and shadcn/ui (light/dark themes, toasts, loading states), split into dedicated Bible and Songs pages with their own live pending-match queues and reading/song queues, and gained translation-comparison ranking, bulk CSV/XLSX song import, and a live preview thumbnail of the projector output.

**Not yet done:**

- **Phase 10 (desktop packaging)** — no PyInstaller bundle or Tauri sidecar yet; running the app currently means starting the backend and `pnpm tauri dev` separately, as above.
- **Phase 11 (hosted multi-tenant)** — explicitly deferred; not scheduled until a real church asks for hosted login (see `app-phases/11-hosted-multi-tenant-future.md`).
- Matching confidence thresholds are real, measured values (not guesses), but still flagged as open to retuning once actual service transcripts exist — see Phase 09 and Phase 05's own notes on this.
