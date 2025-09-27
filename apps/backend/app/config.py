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
OPENAI_API_KEY = (_ENV_OPENAI_API_KEY.strip() if _ENV_OPENAI_API_KEY else None) or _read_openai_key_from_file() or "ollama"
MODEL = os.getenv("MODEL", "gpt-oss:20b")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://ollama:11434")
DEV_ALLOW_NO_LLM = os.getenv("DEV_ALLOW_NO_LLM", "0") == "1"

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
	DEBUG: bool = True
	# Help / describe defaults (enable rephrase outside prod unless overridden)
	HELP_REPHRASE_DEFAULT: bool = True
	# LLM provider & defaults
	DEFAULT_LLM_PROVIDER: str = "ollama"  # "ollama" | "openai"
	DEFAULT_LLM_MODEL: str = "gpt-oss:20b"  # for ollama; e.g., "gpt-5" for OpenAI
	OPENAI_BASE_URL: str = "http://localhost:11434/v1"  # Ollama shim OR https://api.openai.com/v1
	OPENAI_API_KEY: str = "ollama"  # real key when provider="openai"
	OPENAI_API_KEY_FILE: str = "/run/secrets/openai_api_key"
	OLLAMA_BASE_URL: str = "http://ollama:11434"
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
