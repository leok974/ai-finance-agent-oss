import os
from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

load_dotenv()

OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "http://localhost:11434/v1")


def _read_openai_key_from_file() -> str | None:
    path = os.getenv("OPENAI_API_KEY_FILE", "/run/secrets/openai_api_key")
    try:
        if path and os.path.isfile(path):
            with open(path, "r", encoding="utf-8") as f:
                return f.read().strip()
    except Exception:
        pass
    return None


_ENV_OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_API_KEY = (
    (_ENV_OPENAI_API_KEY.strip() if _ENV_OPENAI_API_KEY else None)
    or _read_openai_key_from_file()
    or "ollama"
)
MODEL = os.getenv("MODEL", "gpt-oss:20b")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://ollama:11434")

# NVIDIA NIM configuration (preferred for hackathon)
NIM_LLM_URL = os.getenv("NIM_LLM_URL", "")
NIM_EMBED_URL = os.getenv("NIM_EMBED_URL", "")
NIM_API_KEY = os.getenv("NIM_API_KEY", "")
NIM_LLM_MODEL = os.getenv("NIM_LLM_MODEL", "meta/llama-3.1-nemotron-nano-8b-instruct")
NIM_EMBED_MODEL = os.getenv("NIM_EMBED_MODEL", "nvidia/nv-embed-v2")

# RAG Store configuration
RAG_STORE = os.getenv("RAG_STORE", "sqlite")  # "sqlite" or "pgvector"
EMBED_INPUT_TYPE_QUERY = os.getenv("EMBED_INPUT_TYPE_QUERY", "query")
EMBED_INPUT_TYPE_PASSAGE = os.getenv("EMBED_INPUT_TYPE_PASSAGE", "passage")

# NIM Safety & Performance
NIM_TIMEOUT_SEC = int(os.getenv("NIM_TIMEOUT_SEC", "30"))
EMBED_BATCH_SIZE = int(os.getenv("EMBED_BATCH_SIZE", "16"))


def _env_bool(name: str, default: bool = False) -> bool:
    v = os.getenv(name)
    if v is None:
        return default
    try:
        return v.strip().lower() in {"1", "true", "yes", "on"}
    except Exception:
        return default


def _env(name: str, default: str | None = None) -> str | None:
    """Get environment variable with optional default."""
    return os.getenv(name, default)


def _alias(primary: str, *fallbacks: str, default: str | None = None) -> str | None:
    """
    Get env var with fallback aliases. Primary name wins if present.
    Example: _alias("LM_DEV_PIN", "DEV_SUPERUSER_PIN", default=None)
    """
    val = _env(primary)
    if val:
        return val
    for fb in fallbacks:
        v = _env(fb)
        if v:
            return v
    return default


# Only accept explicit numeric '1' for stub mode (avoid accidental 'True' string from host env)
_raw_dev_no_llm = os.getenv("DEV_ALLOW_NO_LLM", "0")
DEV_ALLOW_NO_LLM = True if _raw_dev_no_llm == "1" else False

"""CORS allowlist (dev defaults include both localhost + 127.0.0.1 on 5173/5174).
Read from env and split on commas; strip whitespace and any stray quotes per item.
"""
_cors_env = os.getenv(
    "CORS_ALLOW_ORIGINS",
    "http://127.0.0.1:5173,http://127.0.0.1:5174,http://localhost:5173,http://localhost:5174",
)
CORS_ALLOW_ORIGINS = _cors_env
ALLOW_ORIGINS = [
    o.strip().strip('"').strip("'")
    for o in (_cors_env.split(",") if _cors_env else [])
    if o and o.strip().strip('"').strip("'")
]


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./data/finance.db"
    # Environment flags
    # Prefer explicit ENV; fall back to APP_ENV for legacy compose files.
    ENV: str = os.getenv("ENV", os.getenv("APP_ENV", "dev"))  # dev | staging | prod
    APP_ENV: str = os.getenv(
        "APP_ENV", os.getenv("ENV", "dev")
    )  # dev | prod | test (primary)
    ALLOW_DEV_ROUTES: int = int(os.getenv("ALLOW_DEV_ROUTES", "1"))

    # --- LedgerMind Dev Super Override (canonical LM_* with legacy aliases) ---
    DEV_SUPERUSER_EMAIL: str | None = _alias(
        "LM_DEV_SUPER_EMAIL", "DEV_SUPERUSER_EMAIL", default=None
    )
    DEV_SUPERUSER_PIN: str | None = _alias(
        "LM_DEV_SUPER_PIN", "DEV_SUPERUSER_PIN", default=None
    )
    DEV_UNLOCK_MAX_ATTEMPTS: int = int(os.getenv("DEV_UNLOCK_MAX_ATTEMPTS", "5"))
    DEV_UNLOCK_LOCKOUT_S: int = int(
        os.getenv("DEV_UNLOCK_LOCKOUT_S", "300")
    )  # 5 minutes
    DEBUG: bool = True
    # Help / describe defaults (enable rephrase outside prod unless overridden)
    HELP_REPHRASE_DEFAULT: bool = True
    # LLM provider & defaults
    DEFAULT_LLM_PROVIDER: str = "ollama"  # "ollama" | "openai"
    DEFAULT_LLM_MODEL: str = "gpt-oss:20b"  # for ollama; e.g., "gpt-5" for OpenAI
    OPENAI_BASE_URL: str = (
        "http://localhost:11434/v1"  # Ollama shim OR https://api.openai.com/v1
    )
    OPENAI_API_KEY: str = "ollama"  # real key when provider="openai"
    OPENAI_API_KEY_FILE: str = "/run/secrets/openai_api_key"
    OLLAMA_BASE_URL: str = "http://ollama:11434"
    DEV_ALLOW_NO_LLM: bool = DEV_ALLOW_NO_LLM  # seed with parsed value
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()

# Normalize HELP_REPHRASE_DEFAULT if explicitly set via env for prod toggle
import os as _os

if settings.ENV == "prod":
    # New policy: default ON in prod unless explicitly disabled with 0
    _env_val = _os.getenv("HELP_REPHRASE_DEFAULT")
    if _env_val is not None:
        try:
            settings.HELP_REPHRASE_DEFAULT = bool(int(_env_val))
        except Exception:
            # keep existing value (defaults to True) on parse error
            pass
    # else: leave as True
