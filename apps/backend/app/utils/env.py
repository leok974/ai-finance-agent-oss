import os

def get_env() -> str:
    """Return the current environment string (e.g. 'dev', 'prod', 'test').
    Defaults to 'prod' if unset for safety.
    """
    return os.getenv("APP_ENV") or os.getenv("ENV") or "prod"

def is_dev() -> bool:
    """True if running in dev environment."""
    return get_env().lower() == "dev"

def is_prod() -> bool:
    """True if running in production (default when unset)."""
    return get_env().lower() == "prod"

def is_test() -> bool:
    """True if running in test environment (pytest can set APP_ENV=test)."""
    return get_env().lower() == "test"
