"""Minimal, fast-fail DB startup guard.

Exit code 78 is used for configuration errors.
Skip entirely in TESTING=1 environments.
"""

from __future__ import annotations
import os
import sys
from sqlalchemy import create_engine, text  # type: ignore

CONFIG_ERROR_RC = 78


def require_db_or_exit() -> None:
    # Expanded bypass: dedicated TESTING flag OR standardized APP_ENV markers
    if (os.getenv("TESTING", "0").lower() in {"1", "true", "yes", "on"}) or (
        os.getenv("APP_ENV", "").lower() in {"test", "testing"}
    ):
        print("[STARTUP] TESTING mode: skipping DB check")
        return
    url = os.getenv("DATABASE_URL")
    if not url or "://" not in url:
        print("[FATAL] DATABASE_URL missing/invalid", file=sys.stderr)
        sys.exit(CONFIG_ERROR_RC)
    try:
        engine = create_engine(url, pool_pre_ping=True, future=True)
        with engine.connect() as conn:
            conn.execute(text("select 1"))
        print("[STARTUP] DB connectivity OK")
    except Exception as e:
        print(f"[FATAL] DB check failed: {e}", file=sys.stderr)
        sys.exit(CONFIG_ERROR_RC)


__all__ = ["require_db_or_exit"]
