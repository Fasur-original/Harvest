# app/config.py
from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    APP_NAME: str = "Harvest"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    # Local/desktop dev defaults to SQLite so no external DB server is required;
    # hosted mode overrides this with a postgresql:// URL (see database.py).
    DATABASE_URL: str = "sqlite:///./harvest.db"
    DB_POOL_SIZE: int = 5
    DB_MAX_OVERFLOW: int = 10
    REDIS_URL: str = "redis://localhost:6379/0"
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    # Tauri's dev server runs on 1420 (see desktop/src-tauri/tauri.conf.json), not React's default 3000.
    ALLOWED_ORIGINS: List[str] = ["http://localhost:1420"]

    # STT (Phase 04). Deliberately configurable rather than hardcoded to one
    # hardware profile -- tune per-install via .env instead of a code change
    # (§8 only assumes 8GB+ RAM/no GPU as *a* baseline, not the only one this
    # app should run on). "tiny" on CPU/int8 is the default because it's the
    # one that actually clears the target latency measured on real hardware
    # (see app-phases/04-speech-to-text-pipeline.md) -- "base" measured
    # noticeably more accurate but too slow to keep up live on a modest CPU.
    WHISPER_MODEL_SIZE: str = "tiny"
    WHISPER_DEVICE: str = "cpu"
    WHISPER_COMPUTE_TYPE: str = "int8"
    # 0 = let ctranslate2 choose (its default already, no behavior change).
    # Measured on this dev machine: explicitly capping threads (e.g. half the
    # available cores) can noticeably cut "base" model latency and reduce
    # variance vs. letting it use every core -- but the exact best value is
    # noisy and machine-specific (this dev box shares CPU with unrelated
    # background load), so it's a knob to tune on the real target hardware,
    # not a number to trust from here.
    WHISPER_CPU_THREADS: int = 0
    # Skips per-chunk language auto-detection (free accuracy + speed on short
    # clips, where detection is least reliable) -- change if a church reads in
    # a language other than English.
    WHISPER_LANGUAGE: str = "en"
    # Speech-boundary-aware chunking (VAD), not a fixed clock: buffer at least
    # MIN seconds, then transcribe as soon as a real pause (SILENCE_MS) is
    # detected, or once MAX seconds is hit regardless (bounds worst-case
    # latency for a long run-on sentence with no pause).
    TRANSCRIPT_MIN_CHUNK_SECONDS: float = 1.0
    TRANSCRIPT_MAX_CHUNK_SECONDS: float = 8.0
    TRANSCRIPT_SILENCE_MS: int = 500

    # Matching (Phase 05). "bge-small" is the default for the same reason
    # "tiny" won Phase 04: measured on real hardware, not assumed. Bulk-
    # embedding all ~124k verses took ~23 min with bge-small vs. ~81 min with
    # bge-base on this CPU; per-query latency is negligible either way (under
    # 100ms), so the one-time bulk cost is what actually differs. Bump to
    # BAAI/bge-base-en-v1.5 on faster hardware for better accuracy.
    EMBEDDING_MODEL: str = "BAAI/bge-small-en-v1.5"
    EMBEDDING_DEVICE: str = "cpu"
    # Cosine similarity floor to auto-suggest an embedding match (1.0 =
    # identical). PDD §16 flags this as an open question with no researched
    # value yet -- this is a placeholder to be tuned against real transcripts
    # once the app is actually in use, not a calibrated number.
    MATCH_CONFIDENCE_THRESHOLD: float = 0.75
    MATCH_DEFAULT_TRANSLATION: str = "KJV"

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
