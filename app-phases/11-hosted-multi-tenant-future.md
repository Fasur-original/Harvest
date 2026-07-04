# Phase 11 — Hosted Multi-Tenant Version (Deferred)

## Status

**Not scheduled.** The PDD's own recommended build order (§12) is explicit: "Ship desktop first. Accounts/billing/multi-tenant isolation are infrastructure with no users if built before one church is actually running the app." This phase file exists so the scope is documented, not so it gets picked up next.

## What it would accomplish, when greenlit

- Stand up the central Postgres server-side; add `organization_id` to songs/service-state/org tables, filtered on every query (verse table stays shared and un-tenanted, per §5). **This is not a replacement of SQLite** — the desktop app keeps its local SQLite database permanently. Postgres becomes the central source of truth the desktop *syncs from*, not the thing every live-service request depends on.
- Build the actual sync bridge described in PDD §5.4/§5.5, which nothing before this phase implements (phases 00–10 ship with Bible text baked into the app at install time, per Phase 02 — no live sync exists yet because there's no central DB to sync with):
  - **Verses:** pulled from Postgres once at install/login, refreshed occasionally (they rarely change) — not fetched per-request.
  - **Songs:** written to local SQLite first, pushed to Postgres when a connection exists.
  - **Matching always reads from local SQLite first, unconditionally** — the live "listen → match → suggest → confirm" loop must never block on or fail because Postgres is unreachable. If the sync bridge can't reach the server, the app keeps running on whatever's already in the local copy, silently, with no operator-facing error interrupting a service.
- Build the auth functions (§6.4) — `create_user`, `verify_credentials`, `create_session`, `verify_session`, `create_reset_token`, `reset_password` — backend-owned, not an external provider.
- Build the organization hierarchy functions (§6.3) — `get_organization`, `get_group`, `get_team`, `add_member`, `check_permission` — and the `check_permission` gate on every write route.
- Move display assets (backgrounds/video) to object storage (S3/R2), with Postgres storing only the URL.
- Turn the desktop app into a client that logs into a church's account and syncs that church's data + the shared verse table from the hosted backend.
- Stand up Redis-backed queueing so one church's load can't block another's (§4) — this is also where `worker/`'s scripts, written as in-process modules for desktop (Phase 00), would be split into standalone processes.

## Objective

Not applicable until greenlit — see Status.

## Expected outcomes

Not applicable until greenlit.

## Code quality guardrails (apply *now*, to earlier phases, in anticipation of this)

- Don't add `organization_id` columns, auth tables, or org/group/team schema speculatively into the desktop-only DB during Phases 00–10. Unused hosted-only schema sitting in the MVP database is dead weight the "no dead code" rule (see root `app-phases/README.md`) exists to prevent.
- Do keep the named function layer (§6) strict from Phase 03 onward — the PDD's stated payoff for this is exactly this phase: swapping SQLite for Postgres later means rewriting one function layer, not every route.

## Inputs needed from you

The trigger signal itself, per PDD §16: "at what signal (churches ask for login) do we greenlight starting §12?" This phase stays unscheduled until you say so — no need to decide this now.
