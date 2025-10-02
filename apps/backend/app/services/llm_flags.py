import os
from typing import Literal, Dict

def _env_bool(name: str, default: bool = False) -> bool:
    v = os.getenv(name)
    if v is None:
        return default
    return str(v).strip().lower() in {"1", "true", "yes", "on"}

Mode = Literal["help", "explain", "chat", "other"]

def llm_policy(mode: Mode = "other") -> Dict[str, bool]:
    """Central policy decision for allowing LLM usage.

    Precedence (highest wins):
      1) FORCE_LLM_TESTS -> allow=True, forced=True (tests only)
      2) DEV_ALLOW_NO_LLM -> allow=False, globally_disabled=True
      3) LLM_ALLOW_IN_DEV (non-prod) -> allow=True
      4) Production (env=='prod' and not DEBUG) -> allow=True

    Returns dict with keys:
      - allow: whether callers may invoke an LLM path
      - forced: True only when FORCE_LLM_TESTS overrode policy
      - globally_disabled: True when a global off switch disabled LLM (DEV_ALLOW_NO_LLM)
    """
    force_tests = _env_bool("FORCE_LLM_TESTS", False)
    dev_disallow = _env_bool("DEV_ALLOW_NO_LLM", False)
    allow_dev = _env_bool("LLM_ALLOW_IN_DEV", False)
    env = os.getenv("ENV", os.getenv("APP_ENV", "dev")).lower()
    debug = _env_bool("DEBUG", False)

    if force_tests:
        return {"allow": True, "forced": True, "globally_disabled": False}
    if dev_disallow:
        return {"allow": False, "forced": False, "globally_disabled": True}
    if env != "prod" and allow_dev:
        return {"allow": True, "forced": False, "globally_disabled": False}
    # production default (disable when debug)
    allow_prod = (env == "prod" and not debug)
    return {"allow": allow_prod, "forced": False, "globally_disabled": False if allow_prod else False}
