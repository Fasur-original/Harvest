# Harvest — Build Phases

Source of truth for *what* the app is: `AI-Church-Display-App-PDD (1).md` (repo root). This folder breaks that document down into *the order things get built in*. Each phase is its own file so a phase can be picked up, reviewed, and closed out independently.

## Why this order

The dependency chain is: **data before matching, matching before confirmation, confirmation before packaging.** You can't test regex/embedding matching without Bible text in the DB; you can't test the operator confirmation loop without something to confirm; you can't package the desktop app until the pipeline it's packaging actually works. Phases are ordered so each one is testable on its own before the next one builds on it.

| # | Phase | PDD ref |
|---|---|---|
| 00 | [Foundations & Environment Alignment](00-foundations-and-environment.md) | §3, §11 |
| 01 | [Static Display Shell (No AI)](01-static-display-shell.md) | §9 Phase 1 |
| 02 | [Bible Data Ingestion](02-bible-data-ingestion.md) | §5.2, §8, §15 |
| 03 | [Backend Core & Manual Search](03-backend-core-and-manual-search.md) | §6, §7, §9 Phase 2, §13 |
| 04 | [Speech-to-Text Pipeline](04-speech-to-text-pipeline.md) | §9 Phase 3 |
| 05 | [Matching Logic (Regex + Embeddings)](05-matching-logic.md) | §9 Phase 4 |
| 06 | [Operator Confirmation Loop](06-operator-confirmation-loop.md) | §9 Phase 5 |
| 07 | [Song Ingestion Workflow](07-song-ingestion-workflow.md) | §9 Phase 6, §10 |
| 08 | [Multiple Bible Translations](08-multiple-translations.md) | §9 Phase 7, §5.2 |
| 09 | [Partial Recall & Reading Queue](09-partial-recall-and-reading-queue.md) | §9 Phase 8, §5.6, §6.5, §6.6 |
| 10 | [Desktop Packaging & Bundling](10-desktop-packaging.md) | §14 |
| 11 | [Hosted Multi-Tenant Version (deferred)](11-hosted-multi-tenant-future.md) | §12 |

Phases 00–10 build the desktop MVP. Phase 11 is explicitly **not scheduled** — the PDD's own recommended build order (§12) says it starts only once a real church asks for hosted login, not before.

## Definition of done, every phase

Every phase file lists its own outcomes, but three rules apply everywhere and are not repeated per line item:

1. **One code path per concept.** If verses and songs both need matching, they call the same `search_by_embedding`. If any content type reaches the projector, it goes through the same confirm action. A second implementation of something that already exists is a defect, not a feature.
2. **No leftover scaffolding.** Default template code (Tauri's counter demo, placeholder SVGs, commented-out router imports in `main.py`) gets deleted in the phase that replaces it, not left alongside the real implementation "just in case."
3. **The named function layer (§6) is the only thing that touches the DB.** No route or worker writes raw SQL or queries the ORM directly — everything goes through `app/data/*.py`, per §6's own stated reason: swapping SQLite for Postgres later means changing one layer, not every call site.

## Inputs still needed from you

Each phase file has its own "Inputs needed from you" section where something is genuinely a judgment call only you can make (a threshold, a licensing decision, a sample file). The ones that block starting *now* are called out separately in this session — see the questions asked alongside this document.
