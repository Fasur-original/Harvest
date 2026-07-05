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

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
