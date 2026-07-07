# Phase 06 — Operator Confirmation Loop

**Status: Complete.**

## Most of this phase's scope was already built ahead of schedule

Worth being upfront about: Phase 06's stated deliverables — a confirm action that's the only path to the projector display, a dismiss path, suggestions sitting in a pending state rather than auto-pushing — were already necessary to make Phase 03 and Phase 05 genuinely testable, and got built then rather than stubbed out:

- **The confirm action** (`manager.send_to_all` on the backend, triggered by `{"action": "confirm", ...}`) was built in Phase 03 for manual search results, and Phase 05's `SuggestedMatch.tsx` reuses the exact same call rather than inventing a second one — satisfying this phase's guardrail ("exactly one function triggers a projector push") by construction, not by revisiting it now.
- **Dismiss** and **pending state** (a suggestion sits in local state until the operator acts on it, never auto-pushed) were built into `SuggestedMatch.tsx` in Phase 05, since a suggestion panel with no way to reject a wrong match isn't something I was willing to ship even under Phase 05's heading.

One deliberate naming deviation: the PDD's repo layout (§11) names `MatchPreview.tsx` and `ConfirmButton.tsx` as separate components. I built one component, `SuggestedMatch.tsx`, covering both jobs. Splitting it now would be a pure rename/reorganization with no functional difference — not worth the churn unless you have a specific reason (team convention, external docs referencing those exact names) to want strict adherence. Flagging it rather than silently deviating.

## What this phase actually added

Real testing in Phase 05 surfaced a genuine gap: when an operator says something reference-shaped ("Genesis 1-1") that fails to resolve, nothing told the frontend that had happened — a suggestion from an earlier, unrelated utterance just sat on screen, indistinguishable from a fresh one. That's a real violation of the spirit of "pending state," even though the mechanics were already in place.

Fixed with a three-way distinction in `find_match()` (`app/matching/pipeline.py`):

1. **Resolves to a real verse/song** → broadcast as `{"type": "suggestion", ...}`, as before.
2. **A reference was clearly attempted (a recognized book name plus chapter/verse-shaped numbers) but nothing resolved** → new `{"kind": "unresolved_reference"}` return, which `transcript.py` broadcasts as `{"type": "no_match"}`. `SuggestedMatch.tsx` clears any currently-displayed suggestion on receiving this.
3. **Nothing reference-shaped was said at all** (ordinary conversation, singing, etc.) → still plain `None`, no broadcast, no effect on the frontend.

The distinction between (2) and (3) matters and was deliberate: broadcasting "no match" on *every* non-matching line (case 3) would be actively harmful, not just noisy — it would clear a suggestion still legitimately awaiting the operator's confirmation just because the preacher kept talking after naming a verse, before the operator got to click Confirm. Scoping the clear-signal to only fire when a reference was clearly attempted and specifically failed avoids that: ordinary continued speech has no recognized book name at all, so it never triggers the signal, and a pending suggestion stays safely on screen until the operator acts on it or a new attempted-but-failed reference genuinely supersedes it.

## Verification performed

- Three-way distinction tested directly against `find_match()`: `"John 3:16"` → resolved suggestion; `"John 99:99"` (John has no 99th chapter) → `{"kind": "unresolved_reference"}`; `"the weather is nice today"` → `None`.
- Embedding path re-verified unaffected by the pipeline change (Psalm 23:1 paraphrase still resolves at 0.97 confidence).
- Frontend type-checks and production build both clean with the new `no_match` handling in `SuggestedMatch.tsx`.

## Being conscious of the preacher's intent (later addition)

Requested: the system needed to tell "a fresh reference is being called out" apart from "the preacher is still explaining/re-quoting the verse already confirmed onto the display" — re-teaching the same passage naturally involves reading it again, paraphrasing it, and citing its reference again out loud, none of which is a request for a *new* lookup.

Built as a small, explainable rule rather than any kind of intent classifier, consistent with this app's "regex then embeddings, nothing fuzzier than necessary" philosophy:

- **`app/matching/display_state.py`** (new) tracks the one verse currently confirmed onto the audience display — an in-process module-level singleton, same pattern as `app.ws`'s `ConnectionManager`. `main.py`'s `/ws` handler calls `display_state.record_confirmed(data)` on every `{"action": "confirm", ...}` message (the same message that already triggers the projector push), before relaying it. Confirming a verse records `(book, chapter, verse)`; confirming a song, or confirming nothing yet, clears it.
- **`app/routes/transcript.py`**'s broadcast loop now checks, for any verse match (regex *or* embedding — a paraphrase mid-sermon is just as much "still explaining the same verse" as a literal re-quote): if it's the exact same verse already confirmed, skip broadcasting a new suggestion. A genuinely different verse, or a song, still suggests normally — only an identical repeat while it's the live confirmed content is suppressed.
- `POST /service/start` and `POST /service/clear` both call `display_state.clear()` — a new or ended service shouldn't carry forward stale "currently displayed" tracking from before.

This directly answers the three-way distinction asked for: singing is already routed to the "songs" embedding scope structurally (Phase 05/07's scope split, nothing new needed there); a fresh reference call-out still suggests immediately (regex, instant); and continued exposition of an already-confirmed verse now goes quiet instead of re-suggesting itself on every paraphrase.

**Verified directly** against a live backend and the real dev database: confirming John 3:16, then re-running `find_match` on `"John 3:16 in the King James"` → correctly identified as "would suppress." Re-running on `"John 3:17"` (a genuinely different verse) → correctly *not* suppressed. Confirming a song afterward → correctly cleared the tracked verse, so a subsequent match on John 3:16 was no longer suppressed.

### Code quality guardrails (addition)

- `find_match()` stays a pure matching function with no knowledge of display state — the suppression check lives entirely in `transcript.py`, the layer that already turns a match into a broadcast decision (it already did exactly this for the `unresolved_reference` → `no_match` translation in the base phase above).

## Code quality guardrails

- Still exactly one function triggers a projector push (`manager.send_to_all`, called identically regardless of whether the confirm came from manual search, a Phase 05 suggestion, or — later — a Phase 09 ranked candidate or queue entry).
- The new `no_match` signal doesn't touch the confirm/display path at all — it only clears the suggestion *panel's* local state, scoped tightly to avoid interfering with a suggestion still legitimately pending.

## Inputs needed from you

None. This phase's scope was fully specified by the PDD with no open questions, and what was left to build after Phase 03/05 turned out to be small.
