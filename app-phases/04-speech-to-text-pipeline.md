# Phase 04 — Speech-to-Text Pipeline

## What to accomplish

- `faster-whisper` worker that reads a **live audio stream** (church sound system feed, or the laptop mic for testing/dev per PDD §3.1/§8) and transcribes it continuously. Audio is read and discarded — never written to disk, per the PDD's explicit safeguard (§3.1, §4).
- Per Phase 00's decision, this runs as a background asyncio task/thread inside the backend process for the desktop build — not a standalone script, and not coordinated through Redis (that's hosted-only, §4/§14).
- An in-process queue carrying transcript **text** (never audio) from the worker to the backend's request-handling side.
- `LiveTranscript.tsx` in the operator console: a live-updating view of what's being transcribed, with no matching logic behind it yet. This phase is a pipeline speed/accuracy check, not a feature.

## Objective

Confirm STT latency and accuracy are workable on the target hardware before any matching logic depends on it being fast enough to feel live. Debugging "matching is wrong" is much harder if "the transcript itself is 8 seconds behind" is also true and unmeasured.

## Expected outcomes

- Speaking into the audio source produces streaming transcript text visible in the operator console within an acceptable latency budget.
- No audio is ever persisted — this should be verifiable by inspection (no file writes anywhere in the STT worker's code path).
- The queue only ever carries text, never audio buffers, across the worker→backend boundary.

## Code quality guardrails

- The STT worker is one task inside the backend process for desktop — don't introduce a Redis/multi-process queue abstraction here "for consistency with hosted mode" when the desktop build explicitly doesn't need it (§14).

## Inputs needed from you

- **Latency target.** "Feels live" needs a number to test against — what's the maximum acceptable delay between something being said and it appearing as transcript text (e.g. 1–2 seconds)? Without this, "pipeline speed check" has no pass/fail line.
- **Hardware confirmation.** PDD §8 assumes an 8GB+ RAM laptop with no GPU is sufficient for `faster-whisper` (small model). If the actual operator laptop spec is known, confirm it now so the whisper model size (tiny/base/small) is chosen against real hardware rather than the PDD's default assumption.
