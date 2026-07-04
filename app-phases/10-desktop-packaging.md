# Phase 10 — Desktop Packaging & Bundling

## What to accomplish

- Package the backend with PyInstaller (`pyinstaller --onefile --name backend app/main.py`), confirming `main.py` calls `uvicorn.run()` directly so the frozen executable can start itself (§14).
- Register the packaged backend as a Tauri **sidecar** (`externalBin` in `tauri.conf.json`), matching the platform-specific binary naming Tauri expects.
- Spawn the sidecar on app launch, forward its stdout to Tauri's console for debuggability, and store the `Child` handle in Tauri's managed state so it can be killed cleanly on window close — the PDD calls out explicitly that skipping this leaves an orphaned backend process running after the app appears closed.
- Hardcode port 8000 on both sides for now, per the PDD's stated MVP scope — the future refinement (port-conflict detection + fallback + writing the actual port to a file Tauri reads) is documented as a later improvement, not required for this phase.

## Objective

Produce a single installable artifact a non-technical church operator can run without ever opening a terminal or knowing FastAPI exists underneath.

## Expected outcomes

- A packaged build launches with no manual `uvicorn` step — the desktop app starts its own backend.
- Closing the app terminates the backend subprocess; no orphaned process survives the window closing.
- The packaged executable contains only runtime code — the Phase 02 Bible-data scraping script and its dependencies (`meaningless`) are **not** bundled, since that step already ran once, offline, before packaging, and its output (`data/bible/*.json`) is what ships instead.

## Code quality guardrails

- Keep the PyInstaller entrypoint (`app/main.py`'s `if __name__ == "__main__"` block) as the only place `uvicorn.run()` is called directly — don't duplicate startup logic between the dev (`uvicorn app.main:app --reload`) and packaged paths.
- `requirements.txt` used to build the frozen executable should not include dev-only or data-prep-only dependencies (`meaningless`, `pyinstaller` itself, test tooling) — separate these if they're currently in one flat file (worth checking now: `backend/requirements.txt` already lists `pyinstaller` inside the main requirements file, which should be split into a dev-requirements file before this phase, not left as-is).

## Inputs needed from you

- **Target OS(es) for packaging.** Tauri needs the specific target-triple binary name per platform (e.g. `backend-x86_64-pc-windows-msvc.exe`). Confirm whether Windows-only is the initial target (matching the dev environment observed) or whether macOS/Linux builds are needed from this phase too.
