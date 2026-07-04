# Phase 02 — Bible Data Ingestion (Public-Domain Translations)

## Why this is its own phase

Every later phase that touches Bible content — manual search (03), matching (05), multiple translations (08) — depends on real verse text existing in the database first. Getting this data is also the one step in the whole project with a genuine legal constraint, so it's worth isolating and getting right before anything is built on top of it, rather than discovering a licensing problem mid-way through Phase 05.

**Confirmed scope: KJV, ASV, YLT, WEB only.** These are the public-domain translations named in the PDD (§5.2, §15). Anything else (TPT, The Message, NIV, ESV, etc.) requires licensing the PDD explicitly says to settle before going live, and is out of scope until that happens.

## Data source (resolved)

The repo you originally pointed to (`jadenzaleski/bible-translations`) builds its data by live-scraping biblegateway.com via the `meaningless` package — its own README says the pre-built files were removed over copyright concerns, so using it means running that scrape yourself against a site whose Terms of Service around automated access isn't something either of us has verified. You opted to avoid that entirely.

**Decision: use `scrollmapper/bible_databases`** (MIT-licensed repo, GitHub) instead. It ships pre-built, ready-to-use `KJV.json`, `ASV.json`, `YLT.json`, and `WEB.json` files directly — no scraping, no live site dependency, nothing generated at prep time. This sidesteps the ToS question completely: it's a static, already-assembled public dataset, not a scraper hitting a live site.

## What to accomplish

- Pull `KJV.json`, `ASV.json`, `YLT.json`, `WEB.json` from `scrollmapper/bible_databases` (`formats/json/`).
- Spot-check each file against known totals before trusting it as a source (e.g. KJV has 31,102 verses total, 66 books) — a quick sanity check now is cheaper than debugging a matching bug later that's actually a missing-verse-in-the-source-data bug.
- Normalize each file's structure into the schema the PDD describes (§5.2): one row per verse, with `book`, `chapter`, `verse`, `translation`, `text` columns — the source repo's per-translation book/verse table shape will need remapping into this flatter structure.
- Write the normalized output to `data/bible/<translation>.json` (per the repo layout in §11 — e.g. `web_translation.json`), so the files ship with the app and are loaded at install time, never fetched live during a service. This is what makes "works fully offline" (§2) actually true.
- One shared loader function (not four copy-pasted scripts) that reads any of the four normalized JSON files and upserts rows into the DB — idempotent, so re-running it doesn't duplicate rows. This becomes the thing `get_verse` (Phase 03) reads from.
- Explicitly **no embeddings yet.** This phase only gets raw verse text stored correctly. Embedding generation is Phase 05's job, once the matching layer exists to consume it.

## Objective

Get compliant, correctly-licensed verse text sitting in the database, in the exact shape the rest of the app expects, before any code is written that assumes it's there.

## Expected outcomes

- Local DB contains all four translations, fully loaded, queryable by `(book, chapter, verse, translation)`.
- Re-running the loader is a no-op on already-loaded data (safe upsert, not duplicate inserts).
- `data/bible/*.json` exists in the repo, in Harvest's own normalized schema, and is the thing the app actually reads from at runtime — the source repo's raw files and any one-time normalization script are dev tooling and do not ship in the packaged desktop app (flagged again in Phase 10).

## Code quality guardrails

- One loader function used for all four translations. If KJV needs different handling than WEB, that's a parameter, not a fourth script.
- One normalization script converting the source repo's shape into Harvest's schema — run once per translation, not hand-edited per file.

## Inputs needed from you

None remaining — sourcing, scope, and format are resolved above.
