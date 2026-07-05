# Phase 05 — Matching Logic (Regex → Embeddings)

**Status: Complete.**

## What was built

- **`app/matching/regex_match.py`** — `parse_reference_candidates(text)`: catches a direct reference ("John 3:16", "1 John 4:8", "First John 4:8", "Genesis chapter 1 verse 1") via a single regex built from `CANONICAL_BOOKS`, with ordinal-word aliases (First/Second/Third → 1/2/3) so both digit and spoken-word forms resolve to the same canonical book. Returns candidates in priority order rather than a single guess, since a bare digit run with no separator is sometimes genuinely ambiguous (see below) — `find_match` tries each against the real database and keeps the first that resolves. `parse_reference` remains as a single-best-guess convenience wrapper.
- **`app/matching/vector_store.py`** — raw `sqlite3` + `sqlite-vec` connection management, deliberately separate from the SQLAlchemy ORM layer (vec0 virtual tables aren't something the ORM models; this is a narrow connection dedicated to the embedding index, sharing the same database file and row ids as the relational tables).
- **`app/matching/vector_match.py`** — `search_by_embedding(text, scope, top_k)`, the one function in the app doing RAG (PDD §6.1/§10.1): one implementation, called with `scope="verses"` or `scope="songs"`, not two near-duplicate functions. Cosine similarity via sqlite-vec's `distance_metric=cosine`. Internally split into `embed_query`/`search_by_vector` so a caller checking multiple scopes for the same text embeds it once, not once per scope (see below). Also `embed_and_store_verses`/`embed_and_store_song_lines` — idempotent bulk-embedding functions (skip rows already indexed).
- **`app/matching/pipeline.py`** — `find_match(text)`: regex first, embeddings only when regex finds nothing (PDD §3.1/§4), single-best-match only (ranked candidates are Phase 09's job). Below the confidence floor, returns `None`.
- **`scripts/embed_content.py`** — the one-time bulk-embed job, explicitly separate from app startup (see "Why bulk-embedding isn't auto-run" below).
- Wired into `app/routes/transcript.py`'s broadcast loop: every transcript line now also runs through `find_match`, and a hit broadcasts `{"type": "suggestion", ...}` over the same `/ws` connection from Phase 03.
- **`desktop/src/operator/SuggestedMatch.tsx`** — shows the latest suggestion with a Confirm/Dismiss pair, reusing the same WS confirm action Phase 03 already built rather than inventing a second push mechanism. Deliberately minimal: full pending-state tracking is Phase 06's job, not this one.

## Why bulk-embedding isn't auto-run on startup

Phase 02's Bible-text load auto-runs on first startup because it takes ~1-2 minutes. Bulk-embedding is a different order of magnitude: **124,389 verses took 4,664 seconds (77.7 minutes)** on this dev machine — over 3x longer than the ~23-minute estimate from a small 80-sentence benchmark. Sustained throughput at scale didn't match the short-burst measurement (likely thermal/resource effects over a much longer run, not something a quick benchmark surfaces). Silently blocking every fresh install for over an hour would be a bad first-run experience, so this stays an explicit, documented one-time step (`python scripts/embed_content.py`) — same pattern as Phase 02's data-prep script, for the same reason: a cost too large to hide.

The confidence threshold (`MATCH_CONFIDENCE_THRESHOLD = 0.75`) is still a placeholder per PDD §16 (no researched value exists yet), but it's now a *validated* placeholder, not a guess: tested against the real, fully-embedded corpus, near-exact matches scored 0.87-0.98, a genuine paraphrase scored 0.97, and clearly unrelated text scored only 0.55-0.56. There's a wide, clean gap at 0.75 — real tuning against actual service transcripts can still move it, but it's not starting from nothing.

## A data quality bug found and fixed along the way

Testing embedding search on a small sample surfaced literal `<FI>...<Fi>` markup in YLT verse text (e.g. `"darkness <FI>is<Fi> on the face of the deep"`) — a "supplied words" italics marker from the original translation that Phase 02's normalization script never stripped. This wasn't a Phase 05 bug, but Phase 05 is what exposed it, and it mattered enough to fix immediately: **8,233 YLT verses (26% of the translation)** had this markup, and it would have shown up literally on the projector screen in a live service.

Fixed in `scripts/prepare_bible_data.py` (added `_clean_verse_text`, stripping `</?Fi>` case-insensitively), regenerated `data/bible/ylt.json`, and reloaded into the live database — Phase 02's loader is idempotent and updates changed text, so this was a normal reload, not a special migration. Exactly 8,233 rows updated, confirmed zero tagged rows remain.

## A regex bug found from your live testing

Real speech testing (not synthetic samples) surfaced a bug my earlier test cases didn't catch: the regex required a colon, a single space, or the literal word "verse" between chapter and verse numbers — but natural spoken phrasing almost always has a comma too ("chapter 3, verse 5", "Psalms 1, verse 1"). That comma broke the match entirely, silently falling through to embedding search on the *reference utterance's own words* ("proverbs chapter 3 verse 5") rather than the verse's content — which explains the off-topic and off-by-one-chapter-or-verse results you were seeing. It wasn't the matching logic being imprecise; the regex path simply wasn't firing at all for almost any naturally-phrased reference.

Fixed by making every separator (book→chapter, chapter→verse) tolerant of an optional comma. Also added "Songs of Solomon" (plural), "Song of Songs", "Psalm" (singular), and "Revelations" as recognized book aliases — "Songs of Solomon" specifically came up in your testing and wasn't covered; the others are common enough to add proactively rather than wait to hit them too.

Verified against your exact reported phrases end-to-end through the full pipeline — all four now resolve to the correct verse at confidence 1.0. Listing several references back-to-back ("Proverbs 3, 5, 2, 6") correctly resolves the first one rather than garbling all of them — full multi-reference sequence support is Phase 09's job, not this one. The original 9-case regression suite still passes unchanged.

## A second, more serious ambiguity bug, found by asking "what if audio captures John316?"

Checking that specific question surfaced something worse than the comma bug: a reference with *no* separator at all between chapter and verse ("John316", from Whisper merging "three sixteen" into one number) is genuinely ambiguous -- chapter 3 verse 16, or chapter 31 verse 6? Regex backtracking always resolves a bare 3-digit run to the 2-digit-chapter reading first (31:6), which is backwards from how people actually speak references. For John that accidentally came out safe (John only has 21 chapters, so 31:6 doesn't exist and it correctly found nothing) -- but tested against **Genesis** and **Psalms** (both with 31+ chapters), "316" resolved *confidently* to the wrong verse (31:6 instead of the intended 3:16), at full 1.0 confidence. A wrong answer shown with total confidence is worse than showing nothing.

Fixed by having `parse_reference_candidates` return both readings in priority order (single-digit chapter first, since that's the far more common spoken pattern) when the ambiguity is genuine, and having `find_match` try each against the real database, keeping the first one that resolves to an actual verse rather than trusting the first regex match blindly. Verified: "Genesis 316" and "John 316" now correctly resolve to 3:16. "Psalms 316" still resolves to 31:6 -- confirmed this is *correct*, not a leftover bug: Psalm 3 only has 8 verses, so 3:16 genuinely doesn't exist, and the fallback to 31:6 (which does exist) is the fix working as designed, not failing. Full 12-case regression suite (9 original + 3 from your live testing) still passes.

## A third separator variant, plus a UX gap it exposed

More live testing surfaced a third punctuation variant Whisper produces between chapter and verse: a hyphen ("Genesis 1-1" for "Genesis 1:1"). Same root cause as the comma bug, different character — `_SEPARATOR_CHARS` now covers comma, colon, hyphen, en dash, and em dash (hyphen placed last in the regex character class so it's read literally rather than as a range). Verified against the exact reported phrase and the full 12-case regression suite; all pass.

This one came with a UX lesson worth recording. What looked like "the app got Genesis 1:1 right, then showed a different verse instead" was actually: `"Genesis 1-1."` failed to regex-match (the bug above) and didn't clear the embedding confidence floor either (a bare reference-shaped phrase doesn't semantically resemble the verse's actual text), so **no new suggestion was generated at all** — the previously-displayed suggestion (from an earlier, unrelated utterance) simply stayed on screen unchanged, because `SuggestedMatch.tsx` only replaces its displayed suggestion when a new one arrives; it has no notion of "the latest utterance didn't match anything." The fix above resolves the underlying cause for this specific case, but the display gap itself — an old match lingering indistinguishably from a fresh one — is a real design gap that Phase 06's proper pending-state tracking should close, not something patched here.

## Two more real gaps found from continued live testing: spelled-out numbers and misheard book names

Testing "Revelation 1:1" surfaced two independent failures at once, worth separating clearly because they need different fixes:

1. **Even with the book name spelled correctly, spelled-out numbers didn't match at all.** `"Revelation, chapter one, verse one."` failed — the regex only ever accepted digits (`\d{1,3}`), never number words. Whisper doesn't consistently convert spoken numbers to digits; small numbers especially are often left as words. Fixed by building a digit-or-word number pattern covering 1-99 (`_build_number_words`, handling compounds like "twenty-one" with both a hyphen and a space, since that boundary is exactly as inconsistent as the chapter:verse separator already found twice before). The existing ambiguous-3-digit-run handling (`"John316"`) is untouched — it's guarded to only apply when both captured numbers are literal digit strings, since spelled-out numbers are always space/hyphen-delimited and never produce that ambiguity.

2. **Whisper misheard "Revelation" as "Revealitions"** (an accent-driven mis-transcription, same family as the STT accuracy discussion earlier) — no literal alias was ever going to cover this specific case, and adding aliases one mis-hearing at a time doesn't generalize. Added a **fuzzy fallback**: when the exact-match regex finds nothing, a more lenient pattern captures any word (plus an optional leading ordinal/digit, for numbered books) in the book-name position and fuzzy-matches it against all known book names/aliases. Only tried when the exact pass fails, so it doesn't turn arbitrary phrases with two nearby numbers into false reference detections — checked directly against phrases like `"I have three cats and five dogs"` and `"the meeting is at three fifteen today"`, both correctly still return nothing.

Verified: `"Revealitions, one-one."` (both failures at once, the exact reported phrase) now correctly resolves to Revelation 1:1. Full regression suite grew from 12 to 17 cases (5 new: spelled-out numbers with a correct book name, and the fuzzy-match case in both digit and word form) — all 17 pass, plus the false-positive checks above.

## Generalizing the fixes: a systematic sweep, not just the reported examples

Asked explicitly to confirm these fixes hold beyond the specific books/numbers already tested. Found two more real gaps this way, both fixed before they could bite:

**Fuzzy matching could confuse two different real books, not just fix a misheard one.** Computed pairwise similarity across all 66 books and their aliases rather than assuming the fuzzy fallback was safe. Found three genuinely close pairs: **Jude/Judges** (0.80), **Zechariah/Zephaniah** (0.78), **Jeremiah/Nehemiah** (0.75) — all close enough to cross the fuzzy-match floor that a garbled version of one could confidently resolve to the *other real book*, which is worse than not matching, since it's a confident wrong answer rather than an honest "nothing found." The tricky part: the legitimate "Revealitions" match (0.87 similarity) sits *above* the Jude/Judges collision risk (0.80) — a single fixed similarity cutoff cannot separate "should match" from "must not match" here. Fixed with a margin check instead: the top candidate must beat the best *different* book by a meaningful margin (0.15), not just clear the floor. Verified this correctly keeps clean, exactly-spoken forms of all six risky books resolving correctly (margin ~0.20 when spoken exactly), while genuinely ambiguous garbled forms sitting between two real books ("judes", "judgy") now safely return nothing instead of guessing, and minor realistic garbling ("zecharia", missing a letter) still resolves correctly to the right book.

**Number words only covered 1-99 — Psalms needed more.** Checked the actual data instead of assuming: Psalms has 150 chapters, and Psalm 119 has 176 verses, both real numbers a spelled-out reference could plausibly use. Extended `_build_number_words` to cover hundreds ("one hundred and fifty" / "one hundred fifty" → 150), up to 999 generally rather than hardcoding today's max as a ceiling. ("Psalm one fifty" without "hundred" is left unresolved deliberately — that's genuinely ambiguous with "chapter 1 verse 50," a perfectly valid alternate reading, not a bug to fix.)

**Full sweep performed**: all 66 canonical books tested across three reference formats each (digit, comma-spoken, word-spoken) — 198/198 pass. All 12 books with 31+ chapters tested against the ambiguous bare-3-digit case — 11 resolve directly to the preferred single-digit-chapter reading, and Psalms correctly falls back to 31:6 (re-confirmed: Psalm 3 has no verse 16). Regex compiles in ~1s at module load (one-time cost, negligible) despite the number-word table growing to 3,258 entries; per-query parse time stayed at ~2ms worst case, immaterial next to Whisper's own multi-second transcription time.

## A real duplicate-work performance fix

Also reported: matching "feels somehow slow" now. One concrete, measurable cause found: every time regex found nothing (which is most ordinary speech — the majority of what a live transcript actually contains), `find_match` searched both verses and songs, and **each of those two calls independently re-embedded the identical query text from scratch**. Embedding, not the database lookup, is the expensive part of a search — running it twice for the same input on every non-matching line was pure waste.

Fixed by splitting `vector_match.py`'s embedding step from its search step: `embed_query(text)` runs once, and the resulting vector is reused for both scopes via a new `search_by_vector(vector, scope, top_k)`, with `search_by_embedding` kept as a single-scope convenience wrapper around both. Measured after the fix: ~417ms average for the full embedding-fallback path (one embed + two parallel vec0 lookups) — down from embedding twice. This is one concrete fix, not a claim that it resolves "feels slow" entirely; the earlier finding still stands that a laptop mic's audio quality is a separate, likely larger factor in perceived responsiveness and accuracy than anything left to tune in the matching pipeline itself.

## Offline-mode robustness

`_ensure_model()` now tries `local_files_only=True` first and only falls back to a network-dependent load if the model genuinely isn't cached yet. Found this was needed when the first bulk-embed attempt failed on a transient network error despite the model already being fully cached from benchmarking — a live network dependency for an already-local model contradicts the PDD's offline-first requirement (§2), and a real network blip during a live service is exactly the scenario that safeguard exists for. Verified: offline load now takes 0.64s with no network call.

## Verification performed

- Regex matcher: 17/17 test cases (9 original synthetic + 8 from real testing: comma/hyphen separators, spelled-out numbers, fuzzy book-name matching), plus the ambiguous no-separator cases (`"John 316"`, `"Genesis 316"`, `"Psalms 316"`) all resolving correctly once checked against the real database, plus false-positive checks (ordinary sentences with nearby numbers correctly matching nothing).
- Embedding search on a diverse subset, then again against the complete, fully-embedded real database: near-exact and paraphrased matches score 0.87-0.98, unrelated text scores 0.55-0.56.
- Full `find_match()` pipeline tested end-to-end against the live database with all three real code paths: `"Turn to John 3:16"` → regex match, confidence 1.0; `"the Lord is my shepherd I shall not want"` → embedding match to Psalm 23:1, confidence 0.97; `"the weather is nice today"` → `None`.
- `verse_vectors` row count (124,409) matches `verses` row count exactly — full corpus embedded, nothing missed.
- Frontend type-checks and production build both clean.

## Code quality guardrails

- One `search_by_embedding` function for both verses and songs, parameterized by `scope` — confirmed, not two near-duplicate implementations.
- Regex patterns for reference detection live in one place (`regex_match.py`).
- The suggestion panel reuses Phase 03's existing confirm action rather than building a second "push to display" path.

## Inputs needed from you

None blocking. The confidence threshold remains open to retuning once real service transcripts exist (per PDD §16), but has real data behind the current placeholder now, not just a guess.
