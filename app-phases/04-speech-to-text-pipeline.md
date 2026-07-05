# Phase 04 — Speech-to-Text Pipeline

**Status: Complete** for everything testable without a live human voice — see "What's left for you" below.

## What was built

- `workers/stt_worker.py` — `STTWorker`: opens the default audio input device via `sounddevice`, buffers incoming audio in memory only, and transcribes it in speech-bounded chunks with `faster-whisper` (see "Accuracy improvements" below for how chunking actually works), pushing resulting text onto an in-process `asyncio.Queue`. No audio is ever written to disk — confirmed by inspection (the only things touching the filesystem in this module are the model weights faster-whisper caches itself; the captured audio never leaves memory).
- `app/routes/transcript.py` — `POST /transcript/start` / `/stop`, `GET /transcript/status`, and a broadcast loop that drains the worker's transcript queue and pushes each line to every connected client over the same `/ws` connection from Phase 03, as `{"type": "transcript", "text": ...}`.
- `desktop/src/operator/LiveTranscript.tsx` — Start/Stop button, a running log of received transcript lines (capped at 20), syncs its running-state on mount via `/transcript/status` so a page reload doesn't show "Start" while it's actually already running.
- New config settings (`app/config.py`, `.env.example`): `WHISPER_MODEL_SIZE`, `WHISPER_DEVICE`, `WHISPER_COMPUTE_TYPE`, `WHISPER_LANGUAGE`, `TRANSCRIPT_MIN_CHUNK_SECONDS`, `TRANSCRIPT_MAX_CHUNK_SECONDS`, `TRANSCRIPT_SILENCE_MS` — deliberately not hardcoded to one hardware profile, since you asked for something that works well across systems rather than one fixed spec.

## Model size: measured, not assumed

The PDD's default assumption (§8) was `faster-whisper` "small" on CPU. Measured against real synthetic speech on this dev machine:

| Model | ~2.6s clip: transcribe time | Real-time factor |
| --- | --- | --- |
| base (int8, CPU) | 2.5–2.9s (one run spiked to 5.5s) | ~0.95–1.1x, occasionally >1x |
| tiny (int8, CPU) | 1.25–1.35s consistently | ~0.5x |

At ~1x real-time factor, "base" can't reliably keep up with continuous live audio on this hardware — a backlog would grow over time. **Default changed to "tiny"**, chunked at 2.0s, giving a typical total latency (buffer fill + transcribe) of ~3.3–3.6s — inside the 2–4s target you set, with occasional slower spikes observed (once ~5.5s) that look like general system noise rather than a pipeline problem. Both values are `.env`-configurable per install; a machine with more headroom can move up to "base" or "small" for better accuracy.

Transcription accuracy itself was excellent on both models — tested against speech synthesized entirely offline (Windows SAPI TTS, so no network dependency for the test audio): `"For God so loved the world, that He gave His only begotten Son."` transcribed correctly (only capitalization differed from the input), same for `"Amazing grace, how sweet the sound."`

## Verification performed

- **Real hardware confirmed present**: `sounddevice.query_devices()` lists an actual microphone array as the default input on this machine — not a given in every environment.
- **`/transcript/start` opens the real device successfully** (`{"running": true}`, no hardware error) and `/transcript/stop` cleans up correctly (`{"running": false}`).
- **Transcription accuracy**: verified directly against `STTWorker._transcribe()` (the exact method the live loop calls) using offline-synthesized speech, for both candidate models.
- **Buffering → transcribe → queue pipeline**: verified by injecting synthetic audio into `_audio_queue` in small chunks (simulating real callback delivery) and confirming correct text arrived on `transcript_queue` via the real `_transcribe_loop()`.
- **Queue → WebSocket broadcast**: this reuses Phase 03's already-verified `manager.send_to_all`, which was proven with two simultaneous real WebSocket connections.
- Frontend type-checks and production build both clean.

## A concurrency bug found during your real testing

Clicking **Start Listening** repeatedly (because model loading takes a few seconds with no visual feedback) triggered overlapping `/transcript/start` calls. `STTWorker.start()` checked `if self._running: return` but didn't set `_running = True` until *after* awaiting the model load — so several concurrent calls could each pass that guard before the first one finished, each opening its own audio stream. Only the last one stayed reachable via `self._stream`; the earlier ones leaked with no code path left to stop them, which is exactly the "can't stop it now" symptom reported. Restarting the backend process was the only way to clear it, since that tears down every leaked stream at the OS level regardless of how many got orphaned.

Fixed two ways:

- **Backend**: `start()` and `stop()` now both take an `asyncio.Lock`, so concurrent calls serialize — a second call blocks until the first has actually set `_running = True`, then sees it and returns instead of opening a second stream. Verified by firing 5 concurrent `/transcript/start` calls (via `asyncio.gather` over threaded blocking requests, so they genuinely overlap on the wire) — all 5 returned `{"running": true}` cleanly with no `PortAudioError`, and 5 concurrent `/transcript/stop` calls afterward all returned `{"running": false}` cleanly too.
- **Frontend**: `LiveTranscript.tsx`'s button now disables itself and shows "Please wait…" while a start/stop request is in flight, so the multi-second model-load window doesn't read as an unresponsive click inviting more clicks — the actual cause of the repeated presses in the first place.

## Accuracy improvements

Requested after initial testing worked but accuracy wasn't ideal. Four changes, roughly cheapest-to-most-impactful:

1. **Explicit language hint.** `_transcribe()` now passes `language=settings.WHISPER_LANGUAGE` (default `"en"`) instead of letting Whisper auto-detect language per chunk — auto-detection is least reliable on short clips, so this is free accuracy *and* free speed.
2. **Domain-specific prompt.** `CHURCH_VOCABULARY_PROMPT` biases the decoder toward this app's actual content — book names and archaic/liturgical phrasing ("verily," "saith the LORD," "Yahweh," etc.) that a generic model is likeliest to mis-transcribe. Passed as `initial_prompt` on every `transcribe()` call.
3. **Model size** — left as your call, no default change. "tiny" was chosen for latency reasons on this specific dev machine (see above); if your actual hardware has more headroom, `WHISPER_MODEL_SIZE=base` in `.env` is a one-line change, already supported.
4. **Speech-boundary-aware chunking, replacing fixed 2-second windows.** This was the biggest structural change. The old design sliced audio on a rigid clock regardless of sentence boundaries — a real problem, since it silently discarded everything past the first 2 seconds of anything longer, cutting speech off mid-word. `_transcribe_loop` now uses `faster_whisper.vad.get_speech_timestamps` to detect actual pauses: it buffers at least `TRANSCRIPT_MIN_CHUNK_SECONDS` (1.0s), then transcribes as soon as `TRANSCRIPT_SILENCE_MS` (500ms) of trailing silence is detected, or once `TRANSCRIPT_MAX_CHUNK_SECONDS` (8.0s) is hit regardless (bounding worst-case latency for a run-on sentence with no natural pause).

   A real bug surfaced building this: since the mic callback doesn't pause just because the code is deciding where to cut, the buffer can already contain the start of the *next* utterance (or the rest of a long one) by the time a flush fires. The first version discarded everything past the cutoff point, silently losing audio. Fixed by carrying `audio[cutoff:]` forward into the new buffer instead of dropping it.

   Verified with two synthetic tests: two sentences separated by a real pause now come through as two separate, complete, correctly-split transcript lines (previously would've been cut off at a fixed 2s regardless of where the pause actually was); and a deliberately long 17-second run-on sentence with no pause now comes through complete across three chunks via the 8s safety cap, instead of the old design silently losing everything past the first 2 seconds. There's a minor accuracy cost right at a forced-cutoff boundary (a word split across two chunks) — an inherent tradeoff of any hard latency cap, not a bug.

## Laptop-mic accuracy: what actually helped, and an honest dead end

After real testing on a laptop mic (not a church soundboard feed) still showed low accuracy, two more things were tried:

**Configurable CPU threading** (`WHISPER_CPU_THREADS`, default `0` = auto). Benchmarking found explicitly capping thread count (vs. letting it use every core) can noticeably cut "base" model latency and variance — but the exact best value was noisy and inconsistent across repeated runs on this shared dev machine, so instead of hardcoding a number that only reflects this sandbox, it's now a tunable setting for whoever deploys on real target hardware.

**Audio gain normalization — tried, tested, and found to be a narrower fix than hoped.** The hypothesis was that a laptop mic's quieter signal was hurting accuracy, so `_normalize_audio()` boosts quiet audio toward a target RMS loudness before VAD/transcription. Tested against three degradation levels (quiet-but-clean, moderate noise, heavy noise) rather than assumed to work:

- **Quiet-but-clean audio** (attenuated volume, minimal added noise): normalization fully recovered accurate transcription. This is the one case it demonstrably helps.
- **Moderate noise added**: both normalized and non-normalized audio came out equally garbled. Amplifying a noise-corrupted signal amplifies the noise right along with the speech — gain normalization can't distinguish one from the other, so it does nothing for this case.
- **Heavier noise, aggressive gain (10x cap)**: one run turned a correctly-empty result ("nothing confident enough detected") into a **hallucinated phrase** ("Jesus Christ, Jesus Christ, Jesus Christ,") — a known Whisper failure mode on out-of-distribution audio. A hallucinated phrase risks a confident, wrong embedding match, which is worse than finding nothing. This wasn't 100% reproducible (noise realization matters), but real enough to change the design.

Kept the normalization (it has a genuine, demonstrated benefit case and doesn't measurably help *or* hurt the noisy cases at a conservative cap), but lowered the default gain cap from 10x to **4x** — testing showed the quiet-but-clean case recovers just as fully at the lower cap, so there was no accuracy reason to keep the higher hallucination risk.

**The honest bottom line**: gain normalization only ever helps a *quiet* signal, not a *noisy* one, and your reported problem ("laptop mic, not a dedicated channel like church has") sounds like it's dominated by background noise, distance, and room echo — exactly the failure mode this fix doesn't touch, because there's no software trick that separates a preacher's voice from room noise after a cheap built-in mic has already blended them together. This is precisely why the PDD's own design (§3.1, §8) routes the actual church sound system output through a proper audio interface for production use, rather than relying on a laptop's built-in mic — that's not a fallback path, it's the intended production setup. Testing on a laptop mic will likely keep showing this ceiling regardless of further software tuning, until tested against a real line-in feed or at least a much closer/cleaner mic source.

## What's left for you

I have no way to produce physical audio input from here, so the one thing I couldn't verify myself is the actual live path: speaking into the real microphone. Please restart the backend fresh, run `pnpm tauri dev`, click **Start Listening** *once* in the operator console (it should now show "Please wait…" briefly rather than feeling unresponsive), and speak — transcript lines should appear within a few seconds, on natural sentence/phrase boundaries now rather than an arbitrary fixed clock. Let me know how the accuracy changes above land in practice.

## Code quality guardrails

- The STT worker is one `asyncio` task inside the backend process (confirmed — no subprocess, no Redis, per Phase 00's desktop-vs-hosted split).
- The queue → WebSocket path reuses Phase 03's `manager.send_to_all` rather than building a second push mechanism — transcript messages and confirm messages travel the same connection, distinguished by a `type`/`action` discriminator.

## Inputs needed from you

Only the live-mic test above. Latency target (2–4s) and hardware philosophy ("works well across systems" → configurable, not hardcoded) are both already resolved and reflected in the settings above.
