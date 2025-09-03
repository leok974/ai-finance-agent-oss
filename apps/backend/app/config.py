import os
from dotenv import load_dotenv

load_dotenv()

OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "http://localhost:11434/v1")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "ollama")
MODEL = os.getenv("MODEL", "gpt-oss:20b")
DEV_ALLOW_NO_LLM = os.getenv("DEV_ALLOW_NO_LLM", "0") == "1"
