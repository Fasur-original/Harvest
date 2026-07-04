# Phase 09 — Partial Recall & Reading Queue

## What to accomplish

Two independent features that both extend the matching layer built in Phase 05, without changing its fundamentals:

**Partial recall (§6.5, §5-adjacent):**
- Extend the caller of `search_by_embedding` (no new function needed — the PDD is explicit this reuses the existing one) to apply a *second*, lower threshold: below the single-suggestion bar but above a "worth showing at all" floor, return the top few ranked candidates instead of nothing.
- `MatchOptions.tsx`: shows the ranked list, operator picks one with a single click — same one-action confirmation model as a single suggestion (Phase 06), just choosing from a short list.

**Reading queue (§5.6, §6.6):**
- `parse_reference_sequence`: detects an utterance naming several references at once ("Genesis 1:1, then Genesis 10:12...") and splits it into an ordered list.
- `create_reading_queue`, `get_next_in_queue`, `advance_queue`: store and step through the sequence for the current service.
- `ReadingQueue.tsx`: shows the queue, lets the operator jump to *any* entry (not just the next one in order) — the PDD is explicit the preacher may go out of sequence.
- Queue is scoped to the current service the same way "today's set" is (§5.6) — cleared/archived when the service ends.

## Objective

Cover the two realistic "less than a clean single match" situations the MVP intentionally deferred: a preacher who paraphrases and doesn't recall the exact reference, and a preacher who announces several references up front rather than one at a time.

## Expected outcomes

- An ambiguous/partial quote produces a short ranked list (not zero results, not a forced single guess) for the operator to pick from.
- A multi-reference announcement produces a queue the operator can step through sequentially or jump around in freely.
- Both features still terminate in the exact same confirm action from Phase 06 — there is no path from a ranked candidate or a queue entry to the projector display that bypasses operator confirmation.

## Code quality guardrails

- No new "confirm" implementation for queue entries or ranked candidates — they call Phase 06's existing confirm function with a different payload shape.
- `parse_reference_sequence` sits alongside `regex_match.py`'s existing single-reference detection, reusing whatever reference-parsing primitives that phase already built — not a second, separate reference parser.

## Inputs needed from you

Three open questions from PDD §16, all judgment calls:
- **Ranked-candidate threshold and count.** What score is the "medium confidence, show options" floor, and how many candidates should show before the list itself becomes noise — 3? 5?
- **Shared or separate thresholds for verses vs. songs.** Songs have no fixed-reference fallback the way verses do (no regex path) — should their confidence thresholds be tuned independently?
- **New queue vs. append to existing.** If a sequence is detected while a queue from earlier in the service is still active, should the app always start fresh, or ask the operator whether to append (e.g. the preacher adds "...and one more, Psalm 23" after the queue was already built)?
