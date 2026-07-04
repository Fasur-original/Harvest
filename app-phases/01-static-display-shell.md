# Phase 01 — Static Display Shell (No AI)

**Status: Complete, superseded by Phase 03.** This phase's Tauri-event message path (`lib/display-bus.ts`) and its hardcoded "Show Sample Verse/Song Line" buttons were placeholder-only by design (see the note below) and have since been removed — `DisplayWindow` now subscribes to the real backend WebSocket from Phase 03. The two-window mechanics (multi-monitor placement, one shared `DisplayWindow` renderer) this phase validated are still in place and unchanged.

## What to accomplish

- Two Tauri windows: the **operator console** (controls, always on the operator's screen) and the **projector output window** (full-screen, high-contrast text, meant to be dragged onto/assigned to the second display).
- Multi-monitor targeting: confirm the projector window can be placed on a specific display and shown full-screen there, independent of where the operator console sits.
- A single shared `DisplayWindow` component that renders "whatever the current display content is" — a block of text — regardless of whether that text came from a verse or a song line. Per the repo layout in PDD §11, there's one `display/DisplayWindow.tsx`, not one component per content type.
- Wire a minimal message path between the two windows (Tauri events, or the same WebSocket client that Phase 03 will introduce for real — either is fine here since this phase is a mechanics check, not the real pipeline).
- Hardcode one sample verse and one sample song line so a button in the operator console can push each to the projector window on demand.

## Objective

Validate the part of the app that's hardest to debug once everything else is running: window placement, multi-monitor behavior, and text rendering at projector scale. Doing this before STT/matching/backend exist means a rendering bug is isolated to rendering, not tangled up with "is the match wrong or is the display wrong."

## Expected outcomes

- Launching the app opens the operator console on the primary display and a separate projector window that can be moved to and shown full-screen on a second display.
- Clicking a "show verse" / "show song line" control in the operator console updates the projector window's content immediately.
- No AI, no backend, no real data — everything here is hardcoded, and that's expected for this phase.

## Code quality guardrails

- One display-state owner. Don't let the operator console and the projector window each keep their own copy of "what's showing" that can drift out of sync — one source of truth, pushed to the projector window.
- One renderer, not two. A verse and a song line are both just text going into `DisplayWindow` — don't build `VerseDisplay.tsx` and `SongDisplay.tsx` as separate components when the PDD's own structure calls for one.

## Inputs needed from you

None to start this phase — it only needs the icon/branding work from Phase 00 to be visually correct, not functionally blocking.
