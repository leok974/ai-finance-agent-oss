import os

def flag(name: str, default: str = "0") -> str:
    return os.getenv(name, default)

DEV_ALLOW_NO_LLM = flag("DEV_ALLOW_NO_LLM")
APP_ENV = flag("APP_ENV", "prod")
INSIGHTS_EXPANDED_DEFAULT = flag("INSIGHTS_EXPANDED_DEFAULT", "0")
