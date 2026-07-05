"""Live speech-to-text worker (Phase 04 -- PDD §3.1, §4, §9 Phase 3).

Captures audio continuously from the default input device (the church sound
system feed routed to the laptop, or the built-in mic for dev/testing per
§3.1/§8) and transcribes it in speech-bounded chunks with faster-whisper.
Audio lives only in memory and is discarded after each chunk is transcribed
-- it is never written to disk. Only the resulting text crosses the queue
boundary into the rest of the app, per the PDD's explicit safeguard (§3.1, §4).

Imported and driven in-process by the backend (see workers/README.md) --
this module has no process entrypoint of its own.
"""

from __future__ import annotations

import asyncio
import queue as sync_queue

import numpy as np
import sounddevice as sd
from faster_whisper import WhisperModel
from faster_whisper.vad import VadOptions, get_speech_timestamps

SAMPLE_RATE = 16_000  # faster-whisper expects 16kHz mono

# Biases the decoder toward this app's actual domain (scripture readings and
# hymn singing) rather than generic speech -- helps most on exactly the
# vocabulary a generic model is likeliest to mis-transcribe: archaic phrasing
# and biblical names/terms.
CHURCH_VOCABULARY_PROMPT = (
    "A church service: scripture reading and hymn singing. "
    "Book names include Genesis, Exodus, Leviticus, Deuteronomy, Psalms, Proverbs, "
    "Isaiah, Jeremiah, Matthew, Mark, Luke, John, Acts, Romans, Corinthians, "
    "Galatians, Ephesians, Philippians, Hebrews, Revelation. "
    "Common phrasing: verily, thou, thee, thy, hath, saith the LORD, Yahweh, "
    "hallelujah, amen, grace, salvation, righteousness."
)


def _normalize_audio(audio: np.ndarray, target_rms: float = 0.1, max_gain: float = 4.0) -> np.ndarray:
    """Boosts quiet audio toward a target loudness before VAD/transcription.

    Measured effect, not assumed: this only helps a genuinely quiet-but-clean
    signal (e.g. speaker further from the mic in an otherwise quiet room) --
    tested against noise-dominated audio, it did nothing (garbled either way,
    since amplifying noise-corrupted audio amplifies the noise right along
    with the speech) and at an aggressive gain cap it once turned a correctly
    "nothing detected" result into a hallucinated phrase, which is worse than
    silence. `max_gain` is kept conservative for that reason -- testing found
    the quiet-but-clean case recovers fully even at this lower cap, so there's
    no accuracy reason to risk a higher one. RMS-based rather than peak-based
    so a single loud transient (a cough, a mic bump) doesn't suppress the
    gain for the rest of the chunk.
    """
    rms = float(np.sqrt(np.mean(np.square(audio))))
    if rms < 1e-6:
        return audio
    gain = min(target_rms / rms, max_gain)
    return np.clip(audio * gain, -1.0, 1.0).astype(np.float32)


class STTWorker:
    def __init__(
        self,
        model_size: str,
        device: str,
        compute_type: str,
        language: str,
        min_chunk_seconds: float,
        max_chunk_seconds: float,
        silence_ms: int,
        cpu_threads: int = 0,
    ) -> None:
        self._model_size = model_size
        self._device = device
        self._compute_type = compute_type
        self._language = language
        self._cpu_threads = cpu_threads
        self._min_chunk_frames = int(min_chunk_seconds * SAMPLE_RATE)
        self._max_chunk_frames = int(max_chunk_seconds * SAMPLE_RATE)
        self._vad_options = VadOptions(min_silence_duration_ms=silence_ms)

        self._model: WhisperModel | None = None
        self._audio_queue: sync_queue.Queue[np.ndarray] = sync_queue.Queue()
        self._transcript_queue: asyncio.Queue[str] = asyncio.Queue()
        self._stream: sd.InputStream | None = None
        self._transcribe_task: asyncio.Task | None = None
        self._running = False
        self._lock = asyncio.Lock()

    @property
    def transcript_queue(self) -> asyncio.Queue[str]:
        return self._transcript_queue

    @property
    def running(self) -> bool:
        return self._running

    def _ensure_model(self) -> WhisperModel:
        if self._model is None:
            self._model = WhisperModel(
                self._model_size,
                device=self._device,
                compute_type=self._compute_type,
                cpu_threads=self._cpu_threads,
            )
        return self._model

    def _on_audio(self, indata: np.ndarray, frames: int, time_info, status) -> None:
        # Runs on PortAudio's own callback thread -- must stay non-blocking.
        self._audio_queue.put(indata[:, 0].copy())

    async def start(self) -> None:
        # Model loading takes a few seconds, during which several overlapping
        # /transcript/start calls (e.g. repeated impatient clicks) could each
        # see `_running` still False and each open their own audio stream --
        # only the last would stay reachable to stop, leaking the rest. The
        # lock serializes concurrent calls so the second one blocks until the
        # first has actually set `_running = True`, then sees it and returns.
        async with self._lock:
            if self._running:
                return
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, self._ensure_model)  # load off the event loop

            self._stream = sd.InputStream(
                samplerate=SAMPLE_RATE, channels=1, dtype="float32", callback=self._on_audio
            )
            self._stream.start()
            self._running = True
            self._transcribe_task = asyncio.create_task(self._transcribe_loop())

    async def stop(self) -> None:
        async with self._lock:
            self._running = False
            if self._transcribe_task is not None:
                self._transcribe_task.cancel()
                self._transcribe_task = None
            if self._stream is not None:
                self._stream.stop()
                self._stream.close()
                self._stream = None
            while not self._audio_queue.empty():  # drop anything buffered -- it's audio, never persisted
                self._audio_queue.get_nowait()

    async def _transcribe_loop(self) -> None:
        loop = asyncio.get_running_loop()
        buffer: list[np.ndarray] = []
        buffered_frames = 0

        try:
            while True:
                try:
                    chunk = self._audio_queue.get_nowait()
                except sync_queue.Empty:
                    await asyncio.sleep(0.1)
                    continue

                buffer.append(chunk)
                buffered_frames += len(chunk)
                if buffered_frames < self._min_chunk_frames:
                    continue

                audio = _normalize_audio(np.concatenate(buffer))
                force = buffered_frames >= self._max_chunk_frames
                cutoff = await loop.run_in_executor(None, self._find_flush_point, audio, force)

                if cutoff is None:
                    continue  # no pause yet and not forced -- keep buffering

                if cutoff == -1:  # pure silence, forced -- nothing to carry forward
                    buffer, buffered_frames = [], 0
                    continue

                if cutoff > 0:
                    text = await loop.run_in_executor(None, self._transcribe_safely, audio[:cutoff])
                    if text:
                        await self._transcript_queue.put(text)

                # Audio past the cutoff isn't necessarily silence -- the
                # buffer can already hold the start of the *next* utterance
                # (the mic callback doesn't pause just because we're deciding
                # where to cut), so it must carry forward, not be discarded.
                remainder = audio[cutoff:]
                buffer = [remainder] if len(remainder) else []
                buffered_frames = len(remainder)
        except asyncio.CancelledError:
            pass

    def _find_flush_point(self, audio: np.ndarray, force: bool) -> int | None:
        """Decides where to cut the buffer for transcription.

        Returns None to keep buffering (no pause detected yet, not forced),
        -1 to discard the buffer outright (nothing but silence, forced), or a
        sample index to transcribe audio[:cutoff] and carry audio[cutoff:]
        forward (a real pause, or the forced cap reached mid-utterance).
        """
        segments = get_speech_timestamps(audio, self._vad_options, sampling_rate=SAMPLE_RATE)
        if not segments:
            return -1 if force else None

        trailing_silence = len(audio) - segments[-1]["end"]
        if force or trailing_silence >= self._vad_options.min_silence_duration_ms * SAMPLE_RATE // 1000:
            return segments[-1]["end"]

        return None

    def _transcribe_safely(self, audio: np.ndarray) -> str:
        try:
            return self._transcribe(audio)
        except Exception as exc:  # noqa: BLE001 - one bad chunk shouldn't kill the live loop
            print(f"stt_worker: transcription error: {exc}")
            return ""

    def _transcribe(self, audio: np.ndarray) -> str:
        model = self._ensure_model()
        segments, _ = model.transcribe(
            audio,
            vad_filter=True,
            language=self._language,
            initial_prompt=CHURCH_VOCABULARY_PROMPT,
        )
        return " ".join(segment.text.strip() for segment in segments).strip()
