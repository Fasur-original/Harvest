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

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
