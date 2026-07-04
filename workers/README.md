# Workers

`stt_worker.py` (Phase 04) and `embed_worker.py` (Phase 05) live here as plain importable modules, not standalone scripts.

For the desktop build, the backend process imports and calls into these modules directly as background asyncio tasks — there's no separate process to spawn, coordinate, or kill (see `app-phases/00-foundations-and-environment.md` and PDD §14: "don't ship stt_worker.py / embed_worker.py as separate executables" for desktop).

The hosted version (`app-phases/11-hosted-multi-tenant-future.md`, PDD §4/§12) is where these get split into genuinely separate processes coordinated by Redis, since one church's transcription load shouldn't be able to block another's. Until that phase starts, a module here should never contain its own process entrypoint (no `if __name__ == "__main__":` launching a long-running loop) — it should only export functions the backend calls in-process.
