# Phase 08 — Multiple Bible Translations

## What to accomplish

- All four translations (KJV, ASV, YLT, WEB) were already fetched and loaded as raw text back in Phase 02 — this phase is "embed and wire in the rest of them," not "go fetch more data." Phase 05 only needed to embed one translation to prove matching worked; this phase embeds the remaining three.
- Extend `regex_match.py` to catch a spoken translation name alongside a reference ("John 3:16 in the King James").
- A default-translation setting per church/service, used when no translation is named explicitly.
- Confirm `get_verse` and `search_by_embedding` already take `translation` as a parameter (per the schema in §5.2) rather than needing new per-translation code paths — if Phase 03/05 built them correctly, this phase shouldn't need to touch those functions at all.

## Objective

Support churches that read from more than one translation in the same service, without duplicating any part of the matching pipeline per translation — the PDD is explicit that `translation` is a column, not a reason for parallel tables or parallel logic (§5.2).

## Expected outcomes

- Naming a translation alongside a reference returns that specific translation's text.
- Omitting a translation name falls back to the configured default.
- Embeddings exist for all four translations, each translation's embeddings generated from its own wording (not shared across translations) per §5.2.

## Code quality guardrails

- If this phase requires changes to `get_verse` or `search_by_embedding` themselves (rather than just calling them with a `translation` argument that already existed), that's a signal Phase 03/05 under-built the schema — fix it there, don't patch around it with translation-specific branches here.

## Inputs needed from you

- Confirm whether copyrighted translations (TPT, The Message, etc.) are in scope for a *future* phase once licensing is settled (PDD §15), or whether the four public-domain translations are the permanent scope. This doesn't block this phase, but affects whether the translation-selection UI should be built assuming a fixed list of four or an extensible one.
