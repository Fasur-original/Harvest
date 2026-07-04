# Phase 05 — Matching Logic (Regex → Embeddings)

## What to accomplish

- `matching/regex_match.py`: catches a direct, unambiguous reference ("John 3:16") and resolves it via `get_verse` (Phase 03) instantly, without touching embeddings.
- `matching/vector_match.py`: generates and stores embeddings (via `bge-base-en-v1.5`, `bge-small` as the documented fallback for weaker hardware) for the Bible text loaded in Phase 02, and for any song lines that exist by this point. `search_by_embedding(text, scope, top_k=5)` is implemented here for the first time.
- Wire the order the PDD specifies (§3.1, §4): regex first, embeddings only when regex finds nothing. This phase implements **single-best-match behavior only** — one confident suggestion or nothing. Ranked multi-candidate output is explicitly Phase 09's job, not this one.
- Connect this to the transcript queue from Phase 04: each transcript chunk gets checked, and a match (if any, above the confidence floor) gets pushed as a suggestion over the WebSocket from Phase 03.

## Objective

This is the core value proposition of the app — turning spoken words into the right on-screen text without the operator typing anything. Everything before this phase was plumbing; this is the first phase where the app does something a slide-clicker operator couldn't do by hand just as fast.

## Expected outcomes

- Speaking a direct reference produces an instant regex-resolved suggestion.
- Speaking a paraphrase or partial quote with no reference produces an embedding-matched suggestion when one candidate is clearly above the confidence floor.
- Below that floor, nothing is suggested — falls back to manual search (Phase 03's UI), matching the PDD's explicit "show nothing" behavior for low-confidence cases (§9 Phase 4, §16).
- Songs and verses both resolve through the same `search_by_embedding` function — the only difference is which table/scope is searched, not a different matching implementation.

## Code quality guardrails

- One `search_by_embedding` function, called with a different `scope` argument for verses vs. songs — not `search_verses_by_embedding` and `search_songs_by_embedding` as separate near-duplicate functions (PDD §10.1 calls this out explicitly: both content types are matched "the same way").
- Regex patterns for reference detection live in one place, not scattered inline wherever a reference might show up.

## Inputs needed from you

- **Confidence threshold(s).** The PDD flags this as an open question (§16) rather than a fixed number: what score gates "suggest this" vs. "show nothing"? This phase can start with a reasonable placeholder (to be tuned against real transcripts later), but confirm you're OK starting with an approximate default rather than a researched value — tuning this properly needs real service audio, which won't exist until the app is actually in use.
