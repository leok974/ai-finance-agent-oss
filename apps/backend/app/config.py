import os
from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

load_dotenv()

OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "http://localhost:11434/v1")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "ollama")
MODEL = os.getenv("MODEL", "gpt-oss:20b")
DEV_ALLOW_NO_LLM = os.getenv("DEV_ALLOW_NO_LLM", "0") == "1"


class Settings(BaseSettings):
	DATABASE_URL: str = "sqlite:///./data/finance.db"
	# Environment flags
	ENV: str = "dev"  # dev | staging | prod
	DEBUG: bool = True
	# LLM provider & defaults
	DEFAULT_LLM_PROVIDER: str = "ollama"  # "ollama" | "openai"
	DEFAULT_LLM_MODEL: str = "gpt-oss:20b"  # for ollama; e.g., "gpt-5" for OpenAI
	OPENAI_BASE_URL: str = "http://localhost:11434/v1"  # Ollama shim OR https://api.openai.com/v1
	OPENAI_API_KEY: str = "ollama"  # real key when provider="openai"
	model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
