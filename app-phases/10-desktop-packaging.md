# Phase 10 — Desktop Packaging & Bundling

**Status: Wiring complete for a local build; multi-platform CI added (`.github/workflows/build.yml`). No build has actually been run yet — deliberately left for you.**

## What was built

- **`backend/app/main.py`** — a `if __name__ == "__main__":` block calling `uvicorn.run(app, host="127.0.0.1", port=8000)` directly, so a PyInstaller-frozen build of this file starts its own server with no `uvicorn app.main:app` step. It's the only place `uvicorn.run()` is called directly — `uvicorn app.main:app --reload` (dev) keeps working completely unchanged, since it imports `app` without ever executing this block.
- **`backend/requirements.txt`** split in two, per this phase's own guardrail (it already flagged `pyinstaller` as misplaced in the runtime file): `requirements.txt` now lists only runtime dependencies; `pyinstaller` moved to a new `requirements-dev.txt` (`-r requirements.txt` plus `pyinstaller`), so the frozen executable's build doesn't accidentally bundle PyInstaller into itself.
- **`desktop/src-tauri/tauri.conf.json`** — `bundle.externalBin: ["binaries/backend"]`, registering the packaged backend as a Tauri sidecar.
- **`desktop/src-tauri/Cargo.toml`** — added `tauri-plugin-shell` (the crate that provides sidecar spawn/kill), and **`desktop/src-tauri/src/lib.rs`** — `spawn_backend_sidecar` (spawns the sidecar, forwards its stdout/stderr to the Tauri process's own console) and `kill_backend_sidecar` (kills it), wired into `.setup()` and the existing "main" window `CloseRequested` handler respectively.
- **Gated to release builds only** (`#[cfg(not(debug_assertions))]`): in dev (`pnpm tauri dev`), the developer still runs the backend manually exactly as before — trying to spawn `binaries/backend-x86_64-pc-windows-msvc.exe` in dev would fail outright, since that file only exists after the separate PyInstaller step below, not after a plain `cargo build`.
- **`desktop/src-tauri/binaries/backend-x86_64-pc-windows-msvc.exe`** — a placeholder, not a real executable. Tauri's own build script validates that this exact file exists at this exact path before `cargo check`/`cargo build`/`pnpm tauri dev` will succeed at all, regardless of debug/release profile — without a placeholder here, adding `externalBin` to the config would have broken ordinary dev work immediately. Replace it with the real build (see below) before actually bundling.
- Port hardcoded to 127.0.0.1:8000 on both sides, per this phase's stated MVP scope.

## A real compile error found and fixed along the way

The first version of `spawn_backend_sidecar` tried to propagate `tauri_plugin_shell`'s error type through `?` into a function returning `tauri::Result<()>` — `tauri::Error` has no `From<tauri_plugin_shell::Error>` impl, so this didn't compile (caught by `cargo check --release`, not by the dev-profile check, since the sidecar code is cfg-gated out of dev builds entirely). Fixed by having `spawn_backend_sidecar` return `()` and handle both fallible steps (`shell().sidecar(...)`, `.spawn()`) with an explicit match, logging and returning early on failure instead. This was also the more correct behavior anyway: a sidecar that fails to spawn shouldn't take the whole app down with it — the operator console still opens either way, same spirit as this app's other degrade-gracefully-not-crash choices (the LLM cleanup step auto-disabling instead of failing startup).

## Verification performed

- `cargo check` (dev profile) — clean, confirms the sidecar code is fully absent from a dev build as intended.
- `cargo check --release` — clean, confirms the actual sidecar spawn/kill code (only reachable in a release build) compiles correctly. This is the one that caught the error above; the dev-profile check alone would have missed it entirely.
- Confirmed no Tauri capability/permission entry is needed: `ShellExt::sidecar()` called from Rust (inside `.setup()`) goes straight to `Command::new_sidecar()` with no scope check at all — the `shell:allow-*` capability system only gates commands invoked from the webview/JS side via IPC, which this design never uses (checked directly in `tauri-plugin-shell`'s own source, not assumed).
- Did **not** run `pyinstaller` or `pnpm tauri build` — left for you, per your explicit request, along with target-OS confirmation (Windows-only assumed, matching the dev environment observed; §10's own open question).

## Cross-platform: CI, not cross-compilation

A PyInstaller executable (and a native Tauri bundle) has to be built *on* the OS it's meant to run on — there's no cross-compiling a working macOS `.app` or Linux binary from this Windows dev environment, the same way you can't produce a native `.exe` from a Mac. So instead of a single local build command, **`.github/workflows/build.yml`** builds all three platforms on GitHub's own runners (`windows-latest`, `macos-latest`, `ubuntu-latest`) in parallel:

- **`workflow_dispatch`** (the "Run workflow" button in GitHub's Actions tab) — builds all three, uploads each as a downloadable workflow artifact. No release created, safe to run any time as a test.
- **Pushing a `v*` tag** (e.g. `v0.1.0`) — same build, plus publishes a **draft** GitHub Release with all three installers attached (`tauri-apps/tauri-action`). Draft, not published outright, so a broken first CI run can be deleted/fixed before anyone downloads it.

Only one architecture per OS for now: `x86_64-pc-windows-msvc`, `aarch64-apple-darwin` (Apple Silicon), `x86_64-unknown-linux-gnu`. An Intel Mac build would need an extra `macos-13`-runner matrix entry (Apple Silicon is what `macos-latest` resolves to today) — not added since nothing needed it yet.

**One-time repo setting needed**: Settings → Actions → General → Workflow permissions → "Read and write permissions", so the built-in `GITHUB_TOKEN` can create the draft release on a tag push. Everything else the workflow needs (Rust, Node, pnpm, Python, Linux's webkit2gtk/appindicator/build deps) it installs itself, on a clean runner, every time — nothing hidden in local machine state.

## Bugs found from your real CI runs

Exactly the "first run surfaces something" pattern every other phase's live testing has hit, four rounds in a row:

1. **`desktop/pnpm-workspace.yaml`** (pre-existing, not something this phase added — likely from an earlier pnpm build-script approval prompt) had an `allowBuilds` setting but no `packages:` field. Any `pnpm-workspace.yaml` presence makes pnpm treat the directory as a workspace root, and a from-scratch install errors if `packages` is missing/empty. Local dev never hit this because `pnpm install` mostly short-circuits to "already up to date" once `node_modules` already exists — CI's genuinely clean install hit the full validation path every time. Fixed by adding `packages: ["."]`, declaring it as the single package it actually is (verified with a real local `pnpm install`).
2. **pnpm version mismatch**: the workflow pinned pnpm to `9`, reasoning (wrongly) from the lockfile's `lockfileVersion: '9.0'` field — that's a lockfile *format* version, not the CLI version. Actual local pnpm is v11.9. Fixed to pin `11` in CI to match.
3. **Node version too old for pnpm 11**: pnpm 11.11 requires Node ≥22.13; the workflow had `node-version: 20`. Fixed to `22`, matching local Node v22.17.
4. **The Linux job hung for hours and had to be manually cancelled**, while Windows and macOS completed fine. Cause: `sentence-transformers` depends on `torch` with no CPU/GPU distinction, and PyPI's default Linux `torch` wheel pulls in several GB of CUDA runtime libraries (`nvidia-cublas-cu12`, `nvidia-cudnn-cu12`, etc.) split across many separate large downloads — this app is CPU-only everywhere by design (no GPU setting exists anywhere in the matching/STT pipeline), so none of that is ever used. Fixed by installing the CPU-only build from PyTorch's own index (`pip install torch --index-url https://download.pytorch.org/whl/cpu`) before the rest of `requirements-dev.txt`, both in CI and in the local build command below and the README's backend setup — satisfying the dependency with the small build before anything else gets a chance to pull the large one.

All four are now fixed in the workflow and, where relevant, in the local setup docs too. **The workflow still hasn't completed a clean end-to-end run yet** — worth re-triggering (`workflow_dispatch`) to confirm these actually clear it, since each fix so far has been reactive to a real failure, not something verified in advance.

## Building it locally, if you'd rather not wait on CI

```bash
# 1. Freeze the backend into a single executable
cd backend
pip install torch --index-url https://download.pytorch.org/whl/cpu  # CPU-only -- see README's Backend setup for why
pip install -r requirements-dev.txt
pyinstaller --onefile --name backend --collect-all faster_whisper --collect-all sentence_transformers --collect-all sqlite_vec app/main.py

# 2. Put it where Tauri's sidecar config expects it, with the target-triple
#    suffix Tauri requires (confirm your triple with `rustc -vV` if unsure --
#    x86_64-pc-windows-msvc is what this dev environment resolved to)
copy dist\backend.exe ..\desktop\src-tauri\binaries\backend-x86_64-pc-windows-msvc.exe

# 3. Build the frontend + bundle the whole app
cd ..\desktop
pnpm install
pnpm tauri build
```

The installer(s) land in `desktop/src-tauri/target/release/bundle/`. A few things worth checking once you have a build in hand (local or from CI):

- **Launch it with no backend running manually** — confirm the window opens and the operator console connects on its own (the sidecar should already be up by the time the window shows).
- **Close the window, then check Task Manager/Activity Monitor** — confirm no leftover `backend` process survives (this is exactly what `kill_backend_sidecar` exists to prevent).
- **Check the terminal Tauri was launched from** (if any) for `[backend] ...`-prefixed lines — that's the sidecar's stdout/stderr being forwarded, useful if something goes wrong inside the frozen backend itself. In CI, this shows up in the job logs instead.
- If the frozen backend fails to start (a `[backend] failed to spawn sidecar: ...` line, or the console never connects), the `--collect-all` flags above are a proactive guard against the most likely culprit — `faster-whisper`/`sentence-transformers`/`sqlite-vec` all pull in native libraries or dynamically-loaded resources PyInstaller's static analysis can miss — but this is a guard, not a guarantee, since it hasn't actually been exercised end-to-end yet.
- The placeholder `binaries/backend-x86_64-pc-windows-msvc.exe` committed to the repo right now is what makes `pnpm tauri dev` work out of the box on a fresh clone — once you overwrite it with a real, large PyInstaller build for your own local testing, decide for yourself whether to commit that (most teams don't commit build artifacts; nothing in `.gitignore` currently excludes it either way, deliberately left as your call). CI never touches this file's committed content — it builds and places its own copy fresh in a throwaway runner every time.

## Code quality guardrails

- Still exactly one place `uvicorn.run()` is called directly (`main.py`'s `__main__` guard) — dev and packaged startup paths aren't duplicated.
- `requirements-dev.txt` layers on top of `requirements.txt` (`-r requirements.txt` + the one build-only addition) rather than duplicating the runtime list.

## Inputs needed from you

- **One-time GitHub setting**: enable "Read and write permissions" for Actions (Settings → Actions → General), so tag-triggered runs can publish the draft release.
- **Triggering the first CI run** (`workflow_dispatch`, or push a `v*` tag) and working through whatever it surfaces — deliberately left for you, since this hasn't been run end-to-end yet.
- If an Intel Mac build turns out to be needed later, that's an additional `macos-13` matrix entry in `.github/workflows/build.yml`, not a code change.
