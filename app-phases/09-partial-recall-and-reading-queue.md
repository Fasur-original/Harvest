# Phase 09 — Partial Recall & Reading Queue

**Status: Complete.**

## What was built: partial recall

Requested directly: the system needed to recognize when the preacher is trying to recall a scripture but can't quite land on the exact book, verse, or wording — not just fail silently the way a sub-threshold embedding match already did.

- **`find_match` (`app/matching/pipeline.py`)** now fetches multiple candidates per scope (`MATCH_CANDIDATE_COUNT`, default 3) instead of just the top one, and checks two thresholds instead of one:
  1. **≥ `MATCH_CONFIDENCE_THRESHOLD` (0.75)** → single auto-suggestion, exactly as before.
  2. **≥ `MATCH_CANDIDATE_THRESHOLD` (0.55) but below that** → not confident enough to guess for the operator, but not nothing either. Returns a `{"kind": "candidates", "candidates": [...]}` ranked list instead.
  3. **Below 0.55** → `None`, same "show nothing" behavior as before.
- **Translation deduplication** (`_dedupe_verses`): each of the four translations embeds the same verse's own wording separately (§5.2), so a KNN search often returns several translations of the *same* verse as separate top hits. Without deduping by `(book, chapter, verse)` first, a "pick one of these 3" list could show the same verse three times in different translations, which defeats the point of offering genuinely different options. Verse search over-fetches 4x before deduping to still surface enough distinct verses afterward.
- **`MatchOptions.tsx`** (new) — shows the ranked list, one "This one" button per candidate. Reuses `OperatorConsole.tsx`'s existing `confirmSuggestion` as its confirm handler unchanged (same `{action: "confirm", ...}` shape a single suggestion already sends) — no second confirm implementation, per this phase's own guardrail.
- Candidate-list verses also go through the same translation-resolution logic as a single suggestion (today's service default, or the install default) — refactored the single-suggestion path's translation logic into a shared `_finalize_verse_candidate` helper so both paths stay identical rather than drifting.
- The existing "already displayed" suppression (Phase 06 addendum) applies per-candidate too — if a half-remembered paraphrase's candidate list happens to include the verse already confirmed on screen, that one entry is filtered out rather than the whole list being suppressed.

## Verification performed, and an honest limitation found

Against the real embedding index:

- A clean, unambiguous paraphrase ("For God so loved the world...") still resolves as a single confident suggestion (0.911) — doesn't degrade to a list just because the list-handling code path now exists.
- A looser, genuinely uncertain paraphrase ("something about a shepherd and green pastures, I can't remember exactly") correctly produced a **ranked list** rather than a single guess or nothing.
- Confirmed no duplicate-translation entries appear in any ranked list produced during testing.

**The uncomfortable finding**: the shepherd/green-pastures paraphrase's ranked list did *not* contain Psalm 23:1, the verse it's actually paraphrasing — the model's top 3 hits were all unrelated. Chasing that down, I measured this embedding model's (`bge-small`) cosine similarity against ordinary, entirely non-scriptural service speech ("let's all stand and greet one another this morning", "please welcome our guest speaker to the platform," etc.) and found it scores **0.68–0.82** against *some* verse in the corpus — overlapping or exceeding both thresholds, including the existing single-suggestion bar that Phase 05 already shipped with. `MATCH_CONFIDENCE_THRESHOLD` and `MATCH_CANDIDATE_THRESHOLD` are both still explicitly-flagged placeholders (PDD §16) for exactly this reason, but this is the first time it's been measured rather than assumed: for short, ordinary English sentences against a ~124k-verse corpus, this model's absolute similarity scale runs high enough that no single cutoff cleanly separates "a real, badly-remembered scripture reference" from "an unrelated announcement that happens to share common words like 'greet' or 'morning.'" This isn't specific to today's feature — it affects the single-suggestion path too — but it's now measured and documented rather than a latent unknown.

I didn't attempt a heuristic fix (e.g. requiring literal word overlap) without your input: that would directly undermine the feature just requested, since "can't remember the exact wording" is precisely the case with the *least* literal overlap with the real verse. This is a real open question for you, not something safe to guess at from here.

## What was built: reading queue

Requested directly: a preacher can name three or more references at once, and isn't guaranteed to read them back in the order he named them — the system needs to track wherever he actually is, not just assume a fixed forward march through an announced list.

- **`parse_reference_sequence(text)`** (`app/matching/regex_match.py`) — scans a line for *two or more* references (`_REFERENCE_RE.finditer`, not `.search`) and returns them all in the order named. Reuses the exact same reference primitives (`_candidates_from_match`) `parse_reference_candidates` is built on — not a second parser. Only the strict, exact-book-name pattern is scanned per slot (not the fuzzy mishearing fallback) — deliberately listing several verses to read is, in practice, clearer speech than a single mumbled reference, and scanning a whole utterance for multiple *fuzzy* matches compounds false-positive risk in a way a single fuzzy match doesn't.
- **`find_match`** tries this before single-reference detection. Every named reference is validated against the real database (same as a single reference); anything that doesn't resolve to a real verse is dropped rather than failing the whole announcement (best-effort partial, same spirit as Phase 07's sheet import). Fewer than 2 valid references falls through to ordinary single-reference handling, as if no sequence had been detected at all.
- **`ReadingQueue`/`ReadingQueueEntry`** (new tables, `app/models/reading_queue.py`) — one active queue at a time, scoped the same way `ServiceSet` is (cleared rather than deleted when superseded or the service ends). `ReadingQueue.current_entry_id` tracks whichever entry is "now reading" — deliberately *not* a fixed pointer that only steps forward by `position`.
- **The rearranging mechanism** (what you asked for): `sync_current_to_reference(db, book, chapter, verse)` (`app/data/reading_queue.py`) finds whichever queue entry matches a given reference and moves the pointer to it, returning the updated queue only when something actually changed. This one function is called from **both**:
  1. `app/routes/transcript.py`'s live broadcast loop, whenever a confident verse match comes in from actual speech (named directly, or matched by wording) — so if the preacher reads the queue out of order, the "now reading" highlight follows wherever he actually goes, not the announced order.
  2. `app/main.py`'s `/ws` confirm handler — so the operator clicking any entry directly in the queue UI (or confirming any verse from anywhere else — manual search, a suggestion) has the identical effect. One function, not two near-duplicate "sync from speech" / "sync from a click" versions.
- **`ReadingQueue.tsx`** (new) — shows every entry with a "Jump here" button (any entry, any order, per PDD §6.6), highlights whichever one is current. Clicking a button fetches that entry's verse text via the existing `GET /bible/verse` endpoint and sends the exact same `{action: "confirm", ...}` every other confirm path already sends — the backend's confirm handler is what actually moves the queue pointer, so the frontend has no separate "jump" logic to keep in sync with the backend's.
- A new service starting fresh (`/service/start` with no service currently active) clears any leftover queue, same as the Phase 06 "already displayed" tracking — but **updating** an already-active service (e.g. just changing its default translation) does *not* clear it, since that would silently wipe an in-progress reading queue as a side effect of an unrelated settings change.

## Verification performed (reading queue)

Against a live backend and the real dev database:

- `parse_reference_sequence("Turn with me to Genesis 1:1, then Genesis 10:12, and Romans 8:28")` → all 3 references, in order.
- The full `find_match` → `create_reading_queue` path produced a queue with all 3 entries, first entry starting as "current."
- **Out-of-order reading**: simulated the preacher reading the *3rd*-named entry first — `sync_current_to_reference` correctly jumped the pointer to it (not the 2nd, i.e. not just "advance by one"). Then simulated reading the *1st* entry next (going backwards) — correctly jumped back. A reference not in the queue at all left it untouched.
- **Real WebSocket test** (not just direct function calls): connected an actual `websockets` client to `/ws`, sent a `confirm` action for the queue's 3rd entry exactly as `ReadingQueue.tsx`'s "Jump here" button would, and confirmed both a `reading_queue` broadcast with the correct `current_entry_id` *and* the original confirm message still relayed to other clients.
- **Service update vs. new-start distinction**: started a service, built a queue, then called `/service/start` again with just a different `default_translation` — queue survived. Called `/service/clear` — queue was removed.
- Frontend type-checks and production build both clean.

## Code quality guardrails

- No second confirm implementation — `MatchOptions.tsx` and `ReadingQueue.tsx` both trigger the exact same confirm action `SuggestedMatch.tsx` already used; the backend's one confirm handler is what moves the queue pointer either way.
- `sync_current_to_reference` is the one place "which queue entry is being read right now" logic lives, called identically from live speech detection and from a manual operator confirm.
- `_finalize_verse_candidate` is the one place translation-resolution logic for a verse candidate lives, used by both the single-match and ranked-list paths.

## Inputs needed from you

- **The threshold/noise-floor finding above** — real usage data is what the PDD already expected this to need (§16); now there's a concrete number to react to rather than an abstract placeholder.
- The PDD's original open questions for partial recall remain: ranked-candidate count (currently 3) and whether verses/songs should have independently-tuned thresholds (currently shared).
- The reading queue's own open question (PDD §16): always replace an in-progress queue with a newly-announced sequence (current behavior), or ask the operator whether to append instead?
