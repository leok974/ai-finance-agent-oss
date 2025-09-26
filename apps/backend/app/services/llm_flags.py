import os

def _env_bool(name: str, default: bool = False) -> bool:
    v = os.getenv(name)
    if v is None:
        return default
    return str(v).strip().lower() in {"1", "true", "yes", "on"}

def llm_allowed(force: bool = False) -> bool:
    """Global guard for enabling LLM calls.
    Priority order:
      1. force + LLM_ALLOW_IN_TESTS (default True) enables for tests or explicit force flag
      2. LLM_ALLOW_IN_DEV=1 enables in any environment
      3. Otherwise only allow in prod (env=='prod') when not DEBUG
    """
    if force and _env_bool("LLM_ALLOW_IN_TESTS", True):
        return True
    if _env_bool("LLM_ALLOW_IN_DEV", False):
        return True
    env = os.getenv("ENV", os.getenv("APP_ENV", "dev")).lower()
    debug = _env_bool("DEBUG", False)
    return env == "prod" and not debug
