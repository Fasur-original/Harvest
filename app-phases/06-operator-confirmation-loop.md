# Phase 06 — Operator Confirmation Loop

## What to accomplish

- `MatchPreview.tsx`: renders whatever suggestion Phase 05 pushed over the WebSocket, without touching the projector display yet.
- `ConfirmButton.tsx`: the one-keypress confirm action described throughout the PDD (§3.1, §9 Phase 5) — this is what calls `manager.send_to_all` (§13) and is the *only* code path that updates the projector window from Phase 01.
- A dismiss/reject path: the operator can discard a wrong suggestion with no side effects (nothing shown, nothing logged as confirmed).
- Suggestions sit in an explicit pending state between "backend pushed it" and "operator acted on it" — not auto-cleared, not auto-pushed.

## Objective

This is the non-negotiable safeguard the entire PDD is built around (§2 Goals, §3): "a wrong guess never reaches the screen." Every content type — a single verse, a single song line, a ranked candidate (Phase 09), a reading-queue entry (Phase 09) — must terminate in this same confirm action before anything is visible to the congregation.

## Expected outcomes

- A suggestion appears in the operator console in a pending state.
- Confirming it (keypress or click) is the only thing that updates Phase 01's projector display.
- Dismissing it clears the suggestion with no effect on the display.
- This works identically regardless of whether the suggestion came from regex or embeddings (Phase 05) — the confirmation loop doesn't know or care which matching path produced it.

## Code quality guardrails

- Exactly one function triggers a projector push. If Phase 09 later needs "confirm from a ranked list" or "confirm the next queue entry," those call the *same* confirm function with a different payload — they don't get their own `send_to_all` call sites.

## Inputs needed from you

None — this phase is pure implementation of an already-fully-specified safeguard.
