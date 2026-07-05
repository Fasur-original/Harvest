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

## Code quality guardrails

- Still exactly one function triggers a projector push (`manager.send_to_all`, called identically regardless of whether the confirm came from manual search, a Phase 05 suggestion, or — later — a Phase 09 ranked candidate or queue entry).
- The new `no_match` signal doesn't touch the confirm/display path at all — it only clears the suggestion *panel's* local state, scoped tightly to avoid interfering with a suggestion still legitimately pending.

## Inputs needed from you

None. This phase's scope was fully specified by the PDD with no open questions, and what was left to build after Phase 03/05 turned out to be small.
