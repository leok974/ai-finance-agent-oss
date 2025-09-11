from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.engine import Engine


def ensure_alembic_version_len(engine: Engine, min_len: int = 64) -> None:
    """Idempotently ensure alembic_version.version_num is wide enough (Postgres only).

    - No-ops for non-Postgres engines.
    - Creates the alembic_version table if missing (with a conservative default width).
    - Widens the version_num column to at least ``min_len`` when needed.
    """
    try:
        if engine.dialect.name != "postgresql":
            return
    except Exception:
        # If engine is misconfigured, don't raise here
        return

    with engine.begin() as conn:
        # Create table if missing (use narrow width; we'll widen below if needed)
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS public.alembic_version (
                    version_num VARCHAR(32) PRIMARY KEY
                )
                """
            )
        )

        # Determine current width
        cur_len = conn.execute(
            text(
                """
                SELECT character_maximum_length
                FROM information_schema.columns
                WHERE table_schema='public'
                  AND table_name='alembic_version'
                  AND column_name='version_num'
                """
            )
        ).scalar()

        # If unknown or too small, widen to desired length
        if cur_len is None or (isinstance(cur_len, int) and cur_len < min_len):
            conn.execute(
                text(
                    f"""
                    ALTER TABLE public.alembic_version
                    ALTER COLUMN version_num TYPE VARCHAR({min_len})
                    """
                )
            )
